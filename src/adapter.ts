import * as vscode from 'vscode';
import { inspect } from 'util';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, RetireEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { PlyLoader } from './loader';
import { PlyRoots } from './plyRoots';
import { PlyRunner } from './runner';
import { PlyConfig } from './config';
import { DiffState } from './result/diff';

export class PlyAdapter implements TestAdapter {

    private disposables: { dispose(): void }[] = [];

    private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
    private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
    protected readonly retireEmitter = new vscode.EventEmitter<RetireEvent>();

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
    get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
    get retire(): vscode.Event<RetireEvent> { return this.retireEmitter.event; }

    private config: PlyConfig;
    private runner: PlyRunner | undefined;

    constructor(
        readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly diffState: DiffState,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly plyRoots: PlyRoots,
        private readonly log: Log
    ) {
        this.log.info(`Initializing Ply for workspace folder: ${workspaceFolder.name}`);
        this.disposables.push(this.testsEmitter);
        this.disposables.push(this.testStatesEmitter);
        this.disposables.push(this.retireEmitter);
        this.config = new PlyConfig(
            workspaceFolder,
            () => this.load(),
            () => this.retireEmitter.fire(),
            () => this.diffState.clearState(),
            log);
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(c => this.config.onChange(c)));
        this.disposables.push(vscode.workspace.onDidSaveTextDocument(d => this.onSave(d)));
    }

    async load(): Promise<void> {
        this.log.info(`Loading plyees: ${this.workspaceFolder.name}`);

        try {
            this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

            const loader = new PlyLoader(this.workspaceFolder, this.config, this.log);

            const requestFiles = this.config.plyOptions.requestFiles;
            const excludes = this.config.plyOptions.excludes;
            const requests = await loader.loadRequests(requestFiles, excludes);

            const caseFiles = this.config.plyOptions.caseFiles;
            const cases = await loader.loadCases(caseFiles, excludes);

            this.plyRoots.build(requests, cases);
            this.log.debug('requestsRoot: ' + this.plyRoots.requestsRoot.toString());
            this.log.debug('requestsRoot.baseSuite: ' + JSON.stringify(this.plyRoots.requestsRoot.baseSuite, null, 2));
            this.log.debug('casesRoot: ' + this.plyRoots.casesRoot.toString());
            this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', suite: this.plyRoots.rootSuite });
        }
        catch (err) {
            console.log(err);
            this.log.error('Error loading ply tests: ' + err, err);
            this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: inspect(err) });
        }
    }

    async run(testIds: string[]): Promise<void> {
        this.log.info(`Running: ${JSON.stringify(testIds)}`);
        try {
            this.runner = new PlyRunner(this.workspaceFolder, this.diffState, this.outputChannel, this.config,
                this.plyRoots, this.log, this.testStatesEmitter);
            await this.runner.runTests(testIds);
        } catch (err) {
            console.error(err);
            this.log.error(err);
            vscode.window.showErrorMessage(`Error running ply tests: ${err.message}`);
        }
    }

    async debug(testIds: string[]): Promise<void> {
        // start a test run in a child process and attach the debugger to it...
        this.log.info(`Debugging: ${JSON.stringify(testIds)}`);

        this.runner = new PlyRunner(this.workspaceFolder, this.diffState, this.outputChannel, this.config,
            this.plyRoots, this.log, this.testStatesEmitter);
		const testRunPromise = this.runner.runTests(testIds, true);

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
			stopOnEntry: false
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

    private onSave(document: vscode.TextDocument) {
        this.log.debug(`saved: ${document.uri}`);
        if (document.uri.scheme === 'file' && document.uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)) {
            if (PlyConfig.isPlyConfig(document.uri.fsPath)) {
                this.config.clearPlyOptions();
                this.load();
            } else {
                const file = document.uri.fsPath;
                const info = this.plyRoots.find(i => i.file === file);
                if (info && info.type === 'suite') {
                    const testIds = info.children.map(i => i.id);
                    // TODO only reload affected files and diff state -- issue #14
                    this.load();
                    this.retireEmitter.fire({ tests: testIds });
                    this.diffState.clearDiffs(testIds);
                } else if (document.languageId === 'yaml') {
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
