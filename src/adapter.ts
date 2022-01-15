import * as path from 'path';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { inspect } from 'util';
import {
    TestAdapter,
    TestLoadStartedEvent,
    TestLoadFinishedEvent,
    TestRunStartedEvent,
    TestRunFinishedEvent,
    TestSuiteEvent,
    TestEvent,
    RetireEvent
} from 'vscode-test-adapter-api';
import { FlowEvent, TypedEvent as Event, Listener, Disposable } from 'flowbee';
import { PlyLoader } from './loader';
import { Info, PlyRoots } from './plyRoots';
import { PlyRunner } from './runner';
import { PlyConfig } from './config';
import { DiffState } from './result/diff';
import { PlyCodeLensProvider } from './codeLens';
import { Values } from './values';

export class PlyAdapter implements TestAdapter {
    private disposables: { dispose(): void }[] = [];

    private readonly testsEmitter = new vscode.EventEmitter<
        TestLoadStartedEvent | TestLoadFinishedEvent
    >();
    private readonly testStatesEmitter = new vscode.EventEmitter<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >();
    private readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
        return this.testsEmitter.event;
    }
    get testStates(): vscode.Event<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    > {
        return this.testStatesEmitter.event;
    }
    get retire(): vscode.Event<RetireEvent> {
        return this.retireEmitter.event;
    }
    retireIds(testIds: string[]) {
        this.retireEmitter.fire({ tests: testIds });
    }

    config: PlyConfig;
    private runner: PlyRunner | undefined;
    values?: Values;

    private _onFlow = new Event<FlowEvent>();
    onFlow(listener: Listener<FlowEvent>): Disposable {
        return this._onFlow.on(listener);
    }
    private _onceValues = new Event<{ values: Values }>();
    onceValues(listener: Listener<{ values: Values }>) {
        return this._onceValues.once(listener);
    }
    private _onLoad = new Event<{ success: boolean }>();
    onLoad(listener: Listener<{ success: boolean }>) {
        return this._onLoad.on(listener);
    }

    constructor(
        readonly workspaceFolder: vscode.WorkspaceFolder,
        readonly plyRoots: PlyRoots,
        private readonly diffState: DiffState,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly log: ply.Log
    ) {
        this.log.info(`Initializing Ply for workspace folder: ${workspaceFolder.name}`);
        this.disposables.push(this.testsEmitter);
        this.disposables.push(this.testStatesEmitter);
        this.disposables.push(this.retireEmitter);
        this.config = new PlyConfig(
            workspaceFolder,
            () => this.load(),
            () => this.retireEmitter.fire({}),
            () => this.diffState.clearState()
        );
        this.disposables.push(this.config);
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((c) => this.config.onChange(c))
        );
        this.disposables.push(vscode.workspace.onDidSaveTextDocument((d) => this.onSave(d)));

        let testsLoc = this.config.plyOptions.testsLocation;
        if (process.platform.startsWith('win')) {
            // watcher needs backslashes in RelativePattern base on windows
            testsLoc = testsLoc.replace(/\//g, '\\');
        }
        const requestWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(testsLoc, this.config.plyOptions.requestFiles)
        );
        this.disposables.push(requestWatcher);
        requestWatcher.onDidCreate((uri) => this.onSuiteCreate(uri));
        requestWatcher.onDidChange((uri) => this.onSuiteChange(uri));
        requestWatcher.onDidDelete((uri) => this.onSuiteDelete(uri));

        const caseWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(testsLoc, this.config.plyOptions.caseFiles)
        );
        this.disposables.push(caseWatcher);
        caseWatcher.onDidCreate((uri) => this.onSuiteCreate(uri));
        caseWatcher.onDidChange((uri) => this.onSuiteChange(uri));
        caseWatcher.onDidDelete((uri) => this.onSuiteDelete(uri));

        const flowWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(testsLoc, this.config.plyOptions.flowFiles)
        );
        this.disposables.push(flowWatcher);
        flowWatcher.onDidCreate((uri) => this.onSuiteCreate(uri));
        flowWatcher.onDidChange((uri) => this.onSuiteChange(uri));
        flowWatcher.onDidDelete((uri) => this.onSuiteDelete(uri));

        const submitCodeLensProvider = new PlyCodeLensProvider(workspaceFolder, plyRoots);
        this.disposables.push(
            vscode.languages.registerCodeLensProvider({ language: 'yaml' }, submitCodeLensProvider)
        );
        this.disposables.push(
            vscode.languages.registerCodeLensProvider(
                { language: 'typescript' },
                submitCodeLensProvider
            )
        );
    }

    async load(): Promise<void> {
        this.log.info(`Loading plyees: ${this.workspaceFolder.name}`);

        try {
            this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

            const loader = new PlyLoader(this.config);
            const requests = await loader.loadRequests();
            const cases = await loader.loadCases();
            const flows = await loader.loadFlows();

            const nativeTesting = vscode.workspace
                .getConfiguration('testExplorer', this.workspaceFolder.uri)
                .get('useNativeTesting');

            this.plyRoots.build(requests, cases, flows, !nativeTesting);
            console.debug(`requestsRoot: ${this.plyRoots.requestsRoot.toString()}`);
            console.debug(`casesRoot: ${this.plyRoots.casesRoot.toString()}`);
            console.debug(`flowsRoot: ${this.plyRoots.flowsRoot.toString()}`);

            // tests should be sorted in file order (user can override if they want)
            await vscode.commands.executeCommand('test-explorer.dont-sort');

            this.testsEmitter.fire(<TestLoadFinishedEvent>{
                type: 'finished',
                suite: this.plyRoots.rootSuite
            });
            this._onLoad.emit({ success: true });
        } catch (err: unknown) {
            console.error(err);
            this.log.error('Error loading ply tests: ' + err, err);
            this.testsEmitter.fire(<TestLoadFinishedEvent>{
                type: 'finished',
                errorMessage: inspect(err)
            });
            this._onLoad.emit({ success: false });
        }

        if (!this.values) {
            this.values = new Values(this.workspaceFolder, this.plyRoots, this.log);
            this.disposables.push(this.values);
            this._onceValues.emit({ values: this.values });
            this.disposables.push(
                this.values.onValuesUpdate(async (valuesUpdateEvent) => {
                    if (!valuesUpdateEvent.resultUri) {
                        // it's a values file change -- need to reload
                        this.retireEmitter.fire({});
                        this.diffState.clearState();
                    } else {
                        // result file created or renamed
                        if (!this.plyRoots.getSuiteIdForActualResult(valuesUpdateEvent.resultUri)) {
                            await this.load();
                        }
                    }
                })
            );
        } else {
            this.values.clear(); // values files may have changed
        }
    }

    async run(
        testIds: string[],
        values = {},
        runOptions?: ply.RunOptions & { proceed?: boolean; noAutoOpen?: boolean }
    ): Promise<void> {
        if (!(await this.checkAndProceed(testIds, runOptions))) {
            return;
        }

        this.log.info(`Running: ${JSON.stringify(testIds)}`);
        try {
            this.runner = new PlyRunner(
                this.workspaceFolder,
                this.diffState,
                this.outputChannel,
                !runOptions?.noAutoOpen,
                this.config,
                this.plyRoots,
                this.log,
                this.testStatesEmitter
            );
            this.runner.onFlow((evt) => this._onFlow.emit(evt));
            await this.runner.runTests(testIds, values, false, runOptions);
        } catch (err: unknown) {
            console.error(err);
            this.log.error(`${err}`);
            vscode.window.showErrorMessage(`Error running ply tests: ${err}`);
        }
    }

    async debug(
        testIds: string[],
        values = {},
        runOptions?: ply.RunOptions & { proceed?: boolean }
    ): Promise<void> {
        if (!(await this.checkAndProceed(testIds, runOptions))) {
            return;
        }

        // start a test run in a child process and attach the debugger to it...
        this.log.info(`Debugging: ${JSON.stringify(testIds)}`);

        this.runner = new PlyRunner(
            this.workspaceFolder,
            this.diffState,
            this.outputChannel,
            true,
            this.config,
            this.plyRoots,
            this.log,
            this.testStatesEmitter
        );
        this.runner.onFlow((evt) => this._onFlow.emit(evt));
        const testRunPromise = this.runner.runTests(testIds, values, true, runOptions);

        this.log.info('Starting debug session');
        let debugSession: any;
        try {
            debugSession = await this.startDebugging();
        } catch (err: unknown) {
            this.log.error('Failed starting the debug session - aborting', err);
            this.cancel();
            return;
        }

        const subscription = this.onDidTerminateDebugSession((session) => {
            if (debugSession !== session) {
                return;
            }
            this.log.info('Debug session ended');
            this.cancel();
            subscription.dispose();
        });

        try {
            await testRunPromise;
        } catch (err: unknown) {
            console.error(err);
            this.log.error(`${err}`);
            vscode.window.showErrorMessage(`Error running ply tests: ${err}`);
        }
    }

    /**
     * Check if save needed, and open file (for custom editors) in case run from Test Explorer.
     */
    private async checkAndProceed(
        testIds: string[],
        runOptions?: ply.RunOptions & { proceed?: boolean; noAutoOpen?: boolean }
    ): Promise<boolean> {
        if (!(await this.promptToSaveDirtySuites(testIds))) {
            return false;
        }

        if (!runOptions?.noAutoOpen && this.config.openSuitesWhenRun !== 'Never') {
            const editables: Info[] = this.getEditables(testIds);
            if (editables.length > 0) {
                if (editables.length === 1) {
                    return await this.openEditable(editables[0], runOptions);
                } else if (this.config.openSuitesWhenRun === 'Always') {
                    // you asked for it -- open all suites
                    editables.forEach(async (editable) => {
                        await this.openEditable(editable, { ...runOptions, proceed: true });
                    });
                }
            }
        }

        return true;
    }

    /**
     * False value for 'proceed' indicates flow run came from Test Explorer, so trigger exec through editor
     * and then return immediately since run is triggered separately.
     */
    private async openEditable(
        editable: Info,
        runOptions?: ply.RunOptions & { proceed?: boolean; noAutoOpen?: boolean }
    ): Promise<boolean> {
        const uri = PlyRoots.toUri(editable.id);
        if (uri.path.endsWith('.ply')) {
            await vscode.commands.executeCommand('ply.open-request', {
                uri: uri.with({ fragment: '' })
            });
        } else if (uri.path.endsWith('.flow')) {
            await vscode.commands.executeCommand('ply.open-flow', editable.id);
            if (!runOptions?.proceed) {
                // run through editor to prompt for values if needed
                await vscode.commands.executeCommand(
                    'ply.flow-action',
                    editable.id,
                    'run',
                    runOptions
                );
                return false;
            }
        } else {
            await vscode.commands.executeCommand('vscode.open', uri);
        }
        return true;
    }

    /**
     * Returns request and flow suites with editors
     */
    private getEditables(testIds: string[]): Info[] {
        return this.plyRoots.getFileInfos(testIds);
    }

    /**
     * Returns false if run is canceled.
     */
    private async promptToSaveDirtySuites(testIds: string[]): Promise<boolean> {
        const suiteUris = this.plyRoots
            .getFileInfos(testIds)
            .map((suite) => PlyRoots.toUri(suite.id));
        const dirtyDocs: vscode.TextDocument[] = [];
        for (const doc of vscode.workspace.textDocuments) {
            if (
                doc.isDirty &&
                (doc.fileName.endsWith('.ply') ||
                    suiteUris.find((uri) => uri.toString() === doc.uri.toString()))
            ) {
                dirtyDocs.push(doc);
            }
        }

        if (dirtyDocs.length > 0) {
            let doSave = this.config.saveBeforeRun;
            if (!doSave) {
                const saveAndRun = 'Save and Run';
                const alwaysSave = 'Always Save before Run';
                const docNames = dirtyDocs.map((d) => path.basename(d.fileName));
                const res = await vscode.window.showWarningMessage(
                    `File(s) must be saved before running: ${docNames.join(', ')}`,
                    saveAndRun,
                    alwaysSave,
                    'Cancel'
                );
                doSave = res === saveAndRun || res === alwaysSave;
                if (res === alwaysSave) {
                    vscode.workspace
                        .getConfiguration('ply')
                        .update('saveBeforeRun', true, vscode.ConfigurationTarget.Workspace);
                }
            }

            if (doSave) {
                for (const doc of dirtyDocs) {
                    await doc.save();
                }
                await this.load();
            } else {
                return false;
            }
        }
        return true;
    }

    private async startDebugging(): Promise<vscode.DebugSession> {
        const debuggerConfigName = this.config.debugConfig || 'Ply Debugging';
        const debuggerConfig = this.config.debugConfig || {
            name: 'Ply Debugging',
            type: 'node',
            request: 'attach',
            port: this.config.debugPort,
            protocol: 'inspector',
            timeout: 10000,
            continueOnAttach: true
        };

        const debugSessionPromise = new Promise<vscode.DebugSession>((resolve, reject) => {
            let subscription: vscode.Disposable | undefined;
            subscription = vscode.debug.onDidStartDebugSession((debugSession) => {
                if (debugSession.name === debuggerConfigName && subscription) {
                    resolve(debugSession);
                    subscription.dispose();
                    subscription = undefined;
                }
            });

            setTimeout(() => {
                if (subscription) {
                    reject(new Error('Debug session failed to start within alloted timeout'));
                    subscription.dispose();
                    subscription = undefined;
                }
            }, 10000);
        });

        const started = await vscode.debug.startDebugging(this.workspaceFolder, debuggerConfig);
        if (started) {
            return await debugSessionPromise;
        } else {
            throw new Error('Could not start debug session');
        }
    }

    private onDidTerminateDebugSession(
        cb: (session: vscode.DebugSession) => any
    ): vscode.Disposable {
        return vscode.debug.onDidTerminateDebugSession(cb);
    }

    /**
     * Handle non-suite changes (config, results, etc).
     */
    private onSave(document: vscode.TextDocument) {
        if (
            document.uri.scheme === 'file' &&
            document.uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)
        ) {
            console.debug(`saved: ${document.uri}`);
            if (PlyConfig.isPlyConfig(document.uri.fsPath)) {
                this.config.clearPlyOptions();
                this.load();
                this.retireEmitter.fire({});
                this.diffState.clearState();
            } else {
                if (document.languageId === 'yaml') {
                    // expected results
                    const affectedSuiteId = this.plyRoots.getSuiteIdForExpectedResult(document.uri);
                    if (affectedSuiteId) {
                        const testIds = this.plyRoots
                            .getTestInfosForSuite(affectedSuiteId)
                            .map((ti) => ti.id);
                        this.retireEmitter.fire({ tests: testIds });
                        this.diffState.clearDiffs(testIds);
                    }
                } else if (document.languageId === 'json') {
                    // TODO check if values changed and fire retire event & remove diff state
                }
            }
        }
    }

    private onSuiteChange(uri: vscode.Uri) {
        console.debug(`changed: ${uri}`);
        this.load(); // TODO: issue #14
        const info = this.plyRoots.findForFile(uri.fsPath);
        if (info && info.type === 'suite') {
            // existing -- retire only these tests
            const testIds = info.children.map((i) => i.id);
            this.retireEmitter.fire({ tests: testIds });
            this.diffState.clearDiffs(testIds);
        } else {
            this.retireEmitter.fire({});
            this.diffState.clearState();
        }
    }

    private onSuiteCreate(uri: vscode.Uri) {
        console.debug(`created: ${uri}`);
        this.load(); // TODO: issue #14
    }

    private onSuiteDelete(uri: vscode.Uri) {
        console.debug(`deleted: ${uri}`);
        const info = this.plyRoots.findForFile(uri.fsPath);
        // we only care if we know this file (might be ignored)
        if (info) {
            this.load(); // TODO: issue #14
        }
    }

    cancel(): void {
        this.runner?.cancel();
    }

    dispose(): void {
        this.cancel();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
