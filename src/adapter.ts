import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { inspect } from 'util';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, RetireEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { PlyLoader } from './loader';
import { PlyRoots } from './plyRoots';
import { PlyRunner } from './runner';
import { PlyConfig } from './config';
import { DiffState } from './result/diff';
import { SubmitCodeLensProvider } from './codeLens';

export class PlyAdapter implements TestAdapter {

    private disposables: { dispose(): void }[] = [];

    private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
    private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
    private readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
    get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
    get retire(): vscode.Event<RetireEvent> { return this.retireEmitter.event; }
    retireIds(testIds: string[]) { this.retireEmitter.fire({ tests: testIds }); }

    private config: PlyConfig;
    private runner: PlyRunner | undefined;

    constructor(
        readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly plyRoots: PlyRoots,
        private readonly diffState: DiffState,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly log: Log
    ) {
        this.log.info(`Initializing Ply for workspace folder: ${workspaceFolder.name}`);
        this.disposables.push(this.testsEmitter);
        this.disposables.push(this.testStatesEmitter);
        this.disposables.push(this.retireEmitter);
        this.config = new PlyConfig(
            workspaceFolder,
            log,
            () => this.load(),
            () => this.retireEmitter.fire({}),
            () => this.diffState.clearState()
        );
        this.disposables.push(this.config);
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(c => this.config.onChange(c)));
        this.disposables.push(vscode.workspace.onDidSaveTextDocument(d => this.onSave(d)));

        let testsLoc = this.config.plyOptions.testsLocation;
        if (process.platform.startsWith('win')) {
            // watcher needs backslashes in RelativePattern base on windows
            testsLoc = testsLoc.replace(/\//g, '\\');
        }
        const requestWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(testsLoc, this.config.plyOptions.requestFiles));
        this.disposables.push(requestWatcher);
        requestWatcher.onDidCreate(uri => this.onSuiteCreate(uri));
        requestWatcher.onDidChange(uri => this.onSuiteChange(uri));
        requestWatcher.onDidDelete(uri => this.onSuiteDelete(uri));

        const caseWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(testsLoc, this.config.plyOptions.caseFiles));
        this.disposables.push(caseWatcher);
        caseWatcher.onDidCreate(uri => this.onSuiteCreate(uri));
        caseWatcher.onDidChange(uri => this.onSuiteChange(uri));
        caseWatcher.onDidDelete(uri => this.onSuiteDelete(uri));

        const flowWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(testsLoc, this.config.plyOptions.flowFiles));
        this.disposables.push(flowWatcher);
        flowWatcher.onDidCreate(uri => this.onSuiteCreate(uri));
        flowWatcher.onDidChange(uri => this.onSuiteChange(uri));
        flowWatcher.onDidDelete(uri => this.onSuiteDelete(uri));

        const submitCodeLensProvider = new SubmitCodeLensProvider(workspaceFolder, plyRoots);
        this.disposables.push(vscode.languages.registerCodeLensProvider({ language: 'yaml' }, submitCodeLensProvider));
        this.disposables.push(vscode.languages.registerCodeLensProvider({ language: 'typescript' }, submitCodeLensProvider));
    }

    async load(): Promise<void> {
        this.log.info(`Loading plyees: ${this.workspaceFolder.name}`);

        try {
            this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

            const loader = new PlyLoader(this.workspaceFolder, this.config, this.log);
            const requests = await loader.loadRequests();
            const cases = await loader.loadCases();
            const flows = await loader.loadFlows();

            this.plyRoots.build(requests, cases, flows);
            console.debug(`requestsRoot: ${this.plyRoots.requestsRoot.toString()}`);
            // console.debug(`requestsRoot.baseSuite: ${JSON.stringify(this.plyRoots.requestsRoot.baseSuite, null, 2)}`);
            console.debug(`casesRoot: ${this.plyRoots.casesRoot.toString()}`);
            console.debug(`casesRoot.baseSuite: ${JSON.stringify(this.plyRoots.casesRoot.baseSuite, null, 2)}`);
            console.debug(`flowsRoot: ${this.plyRoots.flowsRoot.toString()}`);
            console.debug(`flowsRoot.baseSuite: ${JSON.stringify(this.plyRoots.flowsRoot.baseSuite, null, 2)}`);

            // tests should be sorted in file order (user can override if they want)
            await vscode.commands.executeCommand('test-explorer.dont-sort');

            this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: this.plyRoots.rootSuite });
        }
        catch (err) {
            console.log(err);
            this.log.error('Error loading ply tests: ' + err, err);
            this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: inspect(err) });
        }
    }

    async run(testIds: string[], runOptions?: ply.RunOptions): Promise<void> {
        this.log.info(`Running: ${JSON.stringify(testIds)}`);
        try {
            this.runner = new PlyRunner(this.workspaceFolder, this.diffState, this.outputChannel, this.config,
                this.plyRoots, this.log, this.testStatesEmitter);
            await this.runner.runTests(testIds, false, runOptions);
        } catch (err) {
            console.error(err);
            this.log.error(err);
            vscode.window.showErrorMessage(`Error running ply tests: ${err.message}`);
        }
    }

    async debug(testIds: string[], runOptions?: ply.RunOptions): Promise<void> {
        // start a test run in a child process and attach the debugger to it...
        this.log.info(`Debugging: ${JSON.stringify(testIds)}`);

        this.runner = new PlyRunner(this.workspaceFolder, this.diffState, this.outputChannel, this.config,
            this.plyRoots, this.log, this.testStatesEmitter);
		const testRunPromise = this.runner.runTests(testIds, true, runOptions);

		this.log.info('Starting debug session');
		let debugSession: any;
		try {
			debugSession = await this.startDebugging();
		} catch (err) {
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
        } catch (err) {
            console.error(err);
            this.log.error(err);
            vscode.window.showErrorMessage(`Error running ply tests: ${err.message}`);
        }
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
			subscription = vscode.debug.onDidStartDebugSession(debugSession => {
				if ((debugSession.name === debuggerConfigName) && subscription) {
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

    private onDidTerminateDebugSession(cb: (session: vscode.DebugSession) => any): vscode.Disposable {
		return vscode.debug.onDidTerminateDebugSession(cb);
    }

    /**
     * Handle non-suite changes (config, results, etc).
     */
    private onSave(document: vscode.TextDocument) {
        if (document.uri.scheme === 'file' && document.uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)) {
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
                        const testIds = this.plyRoots.getTestInfosForSuite(affectedSuiteId).map(ti => ti.id);
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
        const file = uri.fsPath;
        this.load(); // TODO: issue #14
        const info = this.plyRoots.find(i => i.file === file);
        if (info && info.type === 'suite') {
            // existing -- retire only these tests
            const testIds = info.children.map(i => i.id);
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
        const file = uri.fsPath;
        const info = this.plyRoots.find(i => i.file === file);
        // we only care if we know this file as a suite (might be ignored)
        if (info && info.type === 'suite') {
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
