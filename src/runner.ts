import * as os from 'os';
import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { ChildProcess, fork } from 'child_process';
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestDecoration } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { PlyRoots} from './plyRoots';
import { PlyConfig } from './config';
import { PlyValues } from './values';
import { WorkerArgs } from './worker/args';
import { DiffState } from './result/diff';

export class PlyRunner {

    private runningTestProcess: ChildProcess | undefined;
	private testRunId = 0;

    private readonly workerScript = require.resolve('../../out/worker/bundle.js');

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly diffState: DiffState,
        private readonly outputChannel: vscode.OutputChannel,
        private readonly config: PlyConfig,
        private readonly plyRoots: PlyRoots,
        private readonly log: Log,
        private readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>
    ) { }

    async runTests(testIds: string[], debug = false): Promise<void> {
        this.testRunId++;
        const testRunId = `${this.testRunId}`;

        try {
            const testInfos: TestInfo[] = [];
            for (const testId of testIds) {
                const testOrSuite = this.plyRoots.find(i => i.id === testId);
                if (testOrSuite) {
                    this.collectTests(testOrSuite, testInfos);
                }
            }

            const noExpectedDispensation = await this.checkMissingExpectedResults(testInfos);
            if (!noExpectedDispensation) {
                return;
            }
            const runOptions: ply.RunOptions = { noExpectedResult: noExpectedDispensation };
            if (this.config.importCaseModulesFromBuilt) {
                runOptions.importCaseModulesFromBuilt = true;
            }

            this.fire(<TestRunStartedEvent>{ type: 'started', tests: testIds, testRunId });

            // if we don't fire suite events for all ancestors, Test Explorer UI fails to update
            const ancestors = this.getAncestorSuites(testInfos);
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
        const plyValues = await new PlyValues(this.config.plyOptions.testsLocation).getValues();

        this.outputChannel.clear();
        this.outputChannel.show(true);

        let debugPort = 0;
        const execArgv: string[] = [];
        if (debug) {
            debugPort = this.config.debugPort;
            execArgv.push(`--inspect-brk=${debugPort}`);
        }

        const options = this.config.plyOptions;
        this.log.debug(`options: ${JSON.stringify(options, null, 2)}`);

        const workerArgs: WorkerArgs = {
            cwd: this.config.cwd,
            plyees,  // file locs and/or uris
            plyPath: this.config.plyPath,
            plyOptions: options,
            plyValues,
            runOptions,
            logEnabled: this.log.enabled,
            workerScript: this.workerScript,
            debugPort: debugPort
        };

        return new Promise<void>(resolve => {

            let runningTest: string | undefined = undefined;
            const testRunId = `${this.testRunId}`;

            const childProcScript = this.workerScript;

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

            this.runningTestProcess.on('message', (message: string | TestSuiteEvent | TestEvent | TestRunFinishedEvent) => {

                if (typeof message === 'string') {
                    this.log.debug(`Worker: ${message}`);
                } else {
                    this.log.debug(`Received ${JSON.stringify(message)}`);
                    if (message.type !== 'finished') {
                        const decorations: TestDecoration[] = [];
                        if (message.type === 'test' && message.state === 'failed' || message.state === 'errored') {
                            const testId = (typeof message.test === 'string') ? message.test : message.test.id;
                            const test = this.plyRoots.getTest(testId);
                            if (test) {
                                decorations.push({
                                    line: test.start || 0,
                                    message: `${message.state.toLocaleUpperCase()}: ${message.description}`
                                });
                            }
                        }
                        this.fire({ ...message as any, testRunId, decorations });
                        if (message.type === 'test') {
                            if (message.state === 'running') {
                                runningTest = (typeof message.test === 'string') ? message.test : message.test.id;
                                this.diffState.clearDiffs(runningTest);
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
        console.debug(`TestEvent: ${JSON.stringify(event)}`);
        this.testStatesEmitter.fire(event);
    }

    /**
     * Check for missing expected result file(s).
     * @return dispensation: undefined if run is canceled; Proceed if no missing expected results
     */
    private async checkMissingExpectedResults(testInfos: TestInfo[]): Promise<ply.NoExpectedResultDispensation | undefined> {
        const suitesWithMissingResults: ply.Suite<ply.Request|ply.Case>[] = [];
        for (const testInfo of testInfos) {
            const suite = this.plyRoots.getSuiteForTest(testInfo.id);
            if (suite) {
                if (!suite.ignored) {
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
            const noVerify = { label: 'Run without verifying', description: 'ad hoc execution' };
            items.push(noVerify);
            const addToIgnore = { label: 'Add to .plyignore', description: 'execution will never be attempted'};
            const createExpected = { label: 'Create expected result', description: 'from actual' };
            if (suitesWithMissingResults.reduce((accum, suite) => accum && !suite.runtime.results.expected.location.isUrl, true)) {
                // no suites are loaded from urls
                items.push(addToIgnore);
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
                    return ply.NoExpectedResultDispensation.NoVerify;
                } else if (res === addToIgnore) {
                    // add suite file to .plyignore
                    for (const suite of suitesWithMissingResults) {
                        const suiteLoc = new ply.Location(this.config.plyOptions.testsLocation + '/' + suite.path);
                        const plyIgnore = new ply.Storage(suiteLoc.parent + '/.plyignore');
                        let contents = plyIgnore.read() || '';
                        if (contents && !contents.endsWith('\n')) {
                            contents += os.EOL;
                        }
                        contents += suiteLoc.name;
                        plyIgnore.write(contents);
                    }
                    return;
                } else if (res === createExpected) {
                    return ply.NoExpectedResultDispensation.CreateExpected;
                }
            } else {
                return;
            }
        }
        return ply.NoExpectedResultDispensation.Proceed;
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

    /**
     * Unique array of test parent suites (excluding direct parent).
     */
    getAncestorSuites(testInfos: TestInfo[]): TestSuiteInfo[] {
        const ancestors: TestSuiteInfo[] = [];
        for (const testInfo of testInfos) {
            const parent = this.plyRoots.getParent(testInfo.id);
            if (parent) {
                let ancestor = this.plyRoots.getParent(parent.id);
                while (ancestor) {
                    if (!(ancestors.find(a => a.id === ancestor!.id))) {
                        ancestors.push(ancestor);
                    }
                    ancestor = this.plyRoots.getParent(ancestor.id);
                }
            }
        }
        return ancestors;
    }

    /**
     * Returns a flattened list of all test ids
     */
    collectTests(testOrSuite: TestSuiteInfo | TestInfo, testInfos: TestInfo[], ignore = false) {
        if (testOrSuite.type === 'suite') {
            for (const child of testOrSuite.children) {
                // honor .plyignores when executing from parent suite (not explicitly running test or suite)
                const shouldIgnore = ignore || (child.type === 'suite' && this.plyRoots.getSuite(child.id)?.ignored);
                this.collectTests(child, testInfos, shouldIgnore);
            }
        } else {
            if (!ignore) {
                testInfos.push(testOrSuite);
            }
        }
    }
}
