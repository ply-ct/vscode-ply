import * as vscode from 'vscode';
import { inspect } from 'util';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { PlyLoader } from './loader';
import { PlyRoots } from './plyRoots';
import { PlyRunner } from './runner';
import { PlyConfig } from './config';

export class PlyAdapter implements TestAdapter {

    private disposables: { dispose(): void }[] = [];

    private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
    private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
    private readonly autorunEmitter = new vscode.EventEmitter<void>();

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
    get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
    get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

    private runner: PlyRunner | undefined;
    private config: PlyConfig;

    constructor(
        public readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly outputChannel: vscode.OutputChannel,
        public readonly plyRoots: PlyRoots,
        private readonly log: Log
    ) {
        this.log.info('Initializing Ply...');
        this.config = new PlyConfig(workspaceFolder, log);

        this.disposables.push(this.testsEmitter);
        this.disposables.push(this.testStatesEmitter);
        this.disposables.push(this.autorunEmitter);
    }

    async load(): Promise<void> {
        if (this.log.enabled) {
            this.log.info(`Loading plyees: ${this.workspaceFolder.name}`);
        }

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
            if (this.log.enabled) {
                this.log.error('Error loading ply tests: ' + err, err);
            }
            this.testsEmitter.fire(<TestLoadFinishedEvent>{ type: 'finished', errorMessage: inspect(err) });
        }
    }

    async run(testIds: string[]): Promise<void> {
        if (this.log.enabled) {
            this.log.info(`Running: ${JSON.stringify(testIds)}`);
        }
        this.runner = new PlyRunner(this.workspaceFolder, this.plyRoots, this.outputChannel, this.log, this.testStatesEmitter);
        await this.runner.runTests(testIds);
    }

    async debug(testIds: string[]): Promise<void> {
        // start a test run in a child process and attach the debugger to it...
        if (this.log.enabled) {
            this.log.info(`Debugging: ${JSON.stringify(testIds)}`);
        }

        this.runner = new PlyRunner(this.workspaceFolder, this.plyRoots, this.outputChannel, this.log, this.testStatesEmitter);
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

		await testRunPromise;
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
