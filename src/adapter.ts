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

        const runner = new PlyRunner(this.workspaceFolder, this.plyRoots, this.outputChannel, this.log, this.testStatesEmitter);
        await runner.runTests(testIds);
    }

    // TODO support debugging tests
    // async debug(tests: string[]): Promise<void> {
    //     // start a test run in a child process and attach the debugger to it...
    // }

    cancel(): void {
        // TODO: kill the child process for the current test run (if there is any)
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        this.cancel();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
