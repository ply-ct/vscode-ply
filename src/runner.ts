import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { FlowEvent, TypedEvent as Event, Listener } from 'flowbee';
import { ChildProcess, fork } from 'child_process';
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestDecoration } from 'vscode-test-adapter-api';
import { PlyRoots} from './plyRoots';
import { PlyConfig } from './config';
import { WorkerArgs } from './worker/args';
import { DiffState } from './result/diff';

export class PlyRunner {

    private runningTestProcess: ChildProcess | undefined;
	private testRunId = 0;

    private readonly workerScript = require.resolve('../../out/worker/bundle.js');

    private _onFlow = new Event<FlowEvent>();
    onFlow(listener: Listener<FlowEvent>) {
        this._onFlow.on(listener);
    }

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly diffState: DiffState,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly config: PlyConfig,
        private readonly plyRoots: PlyRoots,
        private readonly log: ply.Log,
        private readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
    ) { }

    async runTests(testIds: string[], runValues: {[key: string]: string}, debug = false, runOptions?: ply.RunOptions): Promise<void> {
        this.testRunId++;
        const testRunId = `${this.testRunId}`;

        try {
            const testInfos: TestInfo[] = [];
            for (const testId of testIds) {
                const testOrSuite = this.plyRoots.find(i => i.id === testId);
                if (testOrSuite) {
                    this.collectTests(testOrSuite, testInfos);
                } else {
                    throw new Error(`No such ply test: ${testId}`);
                }
            }

            let missingResultDispensation: ply.RunOptions | undefined = {};
            if (!runOptions?.submit && !runOptions?.createExpectedIfMissing) {
                missingResultDispensation = await this.checkMissingExpectedResults(testInfos);
            }
            if (!missingResultDispensation) {
                return; // canceled
            }
            runOptions = { ...missingResultDispensation, ...(runOptions || {}) };
            if (this.config.useDist) {
                runOptions.useDist = true;
            }
            // if (this.config.requireTsNode) {
                runOptions.requireTsNode = true;
            // }
            runOptions.values = runValues;

            this.fire(<TestRunStartedEvent>{ type: 'started', tests: testIds, testRunId });

            // if we don't fire suite events for all ancestors, Test Explorer UI fails to update
            const ancestors = this.plyRoots.getAncestorSuites(testInfos);
            for (const ancestor of ancestors) {
                this.fire(<TestSuiteEvent>{ type: 'suite', suite: ancestor.id, state: 'running', testRunId } );
            }

            // convert to plyees
            const plyees = testInfos.map(testInfo => {
                const uri = vscode.Uri.parse(testInfo.id);
                if (uri.scheme === 'file') {
                    let path = uri.fsPath;
                    if (uri.fragment) {
                        path += '#' + uri.fragment;
                    }
                    return path;
                } else {
                    return uri.toString(true);
                }
            });
            this.log.debug(`Plyee(s): ${JSON.stringify(plyees, null, 2)}`);

            await this.runPlyees(plyees, debug, runOptions);

            for (const ancestor of ancestors) {
                this.fire(<TestSuiteEvent>{ type: 'suite', suite: ancestor.id, state: 'completed', testRunId } );
            }
            this.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
        }
        catch (err) {
            console.error(err);
            this.log.error(`Error while running plyees: ${err.stack}`);
            this.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
        }
    }

    async runPlyees(plyees: string[], debug = false, runOptions?: object): Promise<void> {

        let childProcessFinished = false;

        const nodePath = await this.config.getNodePath();

        this.outputChannel.clear();
        this.outputChannel.show(true);

        let debugPort = 0;
        const execArgv: string[] = [];
        if (debug) {
            debugPort = this.config.debugPort;
            execArgv.push(`--inspect-brk=${debugPort}`);
        }

        const options = this.config.plyOptions;

        const workerArgs: WorkerArgs = {
            cwd: this.config.cwd,
            env: this.config.env,
            plyees,  // file locs and/or uris
            plyPath: this.config.plyPath,
            plyOptions: options,
            runOptions,
            logEnabled: this.log.enabled,
            workerScript: this.workerScript,
            debugPort: debugPort
        };

        return new Promise<void>(resolve => {

            let runningTest: string | undefined = undefined;
            const testRunId = `${this.testRunId}`;

            const childProcScript = this.workerScript;

            this.log.info('Starting worker...');
            this.runningTestProcess = fork(
                childProcScript,
                [],
                {
                    execPath: nodePath,
                    execArgv,
                    env: this.stringsOnly({ ...process.env }),
                    stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ]
                }
            );

            this.runningTestProcess.send(workerArgs);

            this.runningTestProcess.on('message', (message: any) => {

                if (typeof message === 'string') {
                    console.debug(`Worker: ${message}`);
                } else {
                    console.debug(`Received: ${JSON.stringify(message)}`);
                    if (message.type === 'flow') {
                        this._onFlow.emit(message.flowEvent);
                    } else if (message.type !== 'finished') {
                        const decorations: TestDecoration[] = [];
                        if (message.type === 'test' && message.state === 'failed' || message.state === 'errored') {
                            const msgTest = (message as TestEvent).message;
                            const testId = (typeof msgTest === 'string') ? msgTest : (msgTest as any).id;
                            const test = this.plyRoots.getTest(testId);
                            if (test) {
                                decorations.push({
                                    line: test.start || 0,
                                    message: `${message.state.toLocaleUpperCase()}: ${message.description}`
                                });
                            }
                        }
                        this.fire({ ...message, testRunId, decorations });
                        if (message.type === 'test') {
                            if (message.state === 'running') {
                                runningTest = (typeof message.test === 'string') ? message.test : message.test.id;
                                if (runningTest) {
                                    this.diffState.clearDiffs(runningTest);
                                }
                            } else {
                                if (runningTest) {
                                    this.diffState.updateDiffs(runningTest, (message as any).diffs || []);
                                }
                                runningTest = undefined;
                            }
                        }
                    }
                }
            });

            const processOutput = (data: Buffer | string) => {

                this.outputChannel.append(data.toString());

                if (runningTest) {
                    this.fire(<TestEvent>{
                        type: 'test',
                        state: 'running',
                        test: runningTest,
                        message: data.toString(),
                        testRunId
                    });
                }
            };

            this.runningTestProcess.stdout!.on('data', processOutput);
            this.runningTestProcess.stderr!.on('data', processOutput);

            this.runningTestProcess.on('exit', () => {
                this.log.info('Worker finished');
                runningTest = undefined;
                this.runningTestProcess = undefined;
                if (!childProcessFinished) {
                    childProcessFinished = true;
                    this.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
                    resolve();
                }
            });

            this.runningTestProcess.on('error', err => {
                console.error(err);
                this.log.error(`Error from child process: ${err}`);
                runningTest = undefined;
                this.runningTestProcess = undefined;
                if (!childProcessFinished) {
                    childProcessFinished = true;
                    this.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
                    resolve();
                }
            });
        });
    }

    cancel(): void {
		if (this.runningTestProcess) {
            this.log.info('Killing running test process');
			this.runningTestProcess.kill();
		}
    }

    fire(event: TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent) {
        // console.debug(`TestEvent: ${JSON.stringify(event)}`);
        this.testStatesEmitter.fire(event);
    }

    /**
     * Returns a flattened list of all test ids
     */
    collectTests(testOrSuite: TestSuiteInfo | TestInfo, testInfos: TestInfo[], skip = false) {
        if (testOrSuite.type === 'suite') {
            for (const child of testOrSuite.children) {
                // honor skip when executing from parent suite (not explicitly running test or suite)
                const shouldSkip = skip || (child.type === 'suite' && this.plyRoots.getSuite(child.id)?.skip);
                this.collectTests(child, testInfos, shouldSkip);
            }
        } else {
            if (!skip && !testInfos.find(ti => ti.id === testOrSuite.id)) {
                testInfos.push(testOrSuite);
            }
        }
    }

    /**
     * Check for missing expected result file(s).
     * @return If expected result file missing: runOptions with dispensation if selected; undefined if run is canceled.
     * If expected result file exists: empty runOptions object.
     */
    private async checkMissingExpectedResults(testInfos: TestInfo[]): Promise<ply.RunOptions | undefined> {
        const suitesWithMissingResults: ply.Suite<ply.Request|ply.Case|ply.Step>[] = [];
        for (const testInfo of testInfos) {
            const suite = this.plyRoots.getSuite(testInfo.id);
            if (suite) {
                if (!suite.skip) {
                    const expectedExists = await suite.runtime.results.expected.exists;
                    if (!expectedExists && !suitesWithMissingResults.find(s => s.path === suite?.path)) {
                        suitesWithMissingResults.push(suite);
                    }
                }
            } else {
                throw new Error(`Cannot find suite for test: ${testInfo.id}`);
            }
        }
        if (suitesWithMissingResults.length > 0) {
            const firstMissingExpected = suitesWithMissingResults[0].runtime.results.expected;
            let firstMissing = firstMissingExpected.location.toString();
            if (firstMissingExpected.location.isChildOf(this.workspaceFolder.uri.fsPath)) {
                firstMissing = firstMissingExpected.location.relativeTo(this.workspaceFolder.uri.fsPath);
            }
            let msg = `No expected result(s): ${firstMissing}`;
            if (suitesWithMissingResults.length > 1) {
                msg += ` (+ ${suitesWithMissingResults.length - 1} more)`;
            }
            const items: vscode.QuickPickItem[] = [];
            const proceed = { label: 'Proceed', description: 'let verification fail' };
            items.push(proceed);
            const noVerify = { label: 'Submit without verifying', description: 'ad hoc execution' };
            items.push(noVerify);
            const addToSkip = { label: 'Add to "ply.skip" setting', description: 'exclude suite from bulk runs'};
            const createExpected = { label: 'Create expected result', description: 'from actual' };
            if (suitesWithMissingResults.reduce((accum, suite) => accum && !suite.runtime.results.expected.location.isUrl, true)) {
                // no suites are loaded from urls
                items.push(addToSkip);
                items.push(createExpected);
            }
            const options = {
                placeHolder: msg,
                canPickMany: false,
                ignoreFocusOut: true
            };
            const res = await vscode.window.showQuickPick(items, options);
            if (res) {
                if (res === noVerify) {
                    return { submitIfExpectedMissing: true };
                } else if (res === addToSkip) {
                    // add suite file to ply.skip setting
                    for (const suite of suitesWithMissingResults) {
                        let skip = this.config.plyOptions.skip;
                        if (typeof skip === 'string' && skip.trim().length > 0) {
                            // TODO: better handling of existing
                            if (skip.startsWith('{')) {
                                const closing = skip.indexOf('}');
                                skip = skip.substring(0, closing) + ',' + suite.path + skip.substring(closing, skip.length);
                            } else {
                                skip = '{' + skip + ',' + suite.path + '}';
                            }
                        } else {
                            skip = '{' + suite.path + '}';
                        }
                        suite.skip = true;
                        vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).update('skip', skip);
                        this.config.clearPlyOptions();
                    }
                    return;
                } else if (res === createExpected) {
                    return { createExpectedIfMissing: true };
                }
            } else {
                return;
            }
        }
        return {};
    }

    private stringsOnly(env: { [envVar: string]: string | null | undefined }): { [envVar: string]: string } {
        const result: { [envVar: string]: string } = {};
        for (const envVar in env) {
            const val = env[envVar];
            if (typeof val === 'string') {
                result[envVar] = val;
            }
        }
        return result;
    }
}
