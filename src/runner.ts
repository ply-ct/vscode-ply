import * as vscode from 'vscode';
import { ChildProcess, fork } from 'child_process';
import { inspect } from 'util';
import { TestSuiteInfo, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { PlyRoots} from './plyRoots';
import { PlyConfig } from './config';
import { PlyValues } from './values';
import { WorkerArgs } from './worker/args';

export class PlyRunner {

    private runningTestProcess: ChildProcess | undefined;
	private testRunId = 0;

    private readonly workerScript = require.resolve('../out/worker/bundle.js');
    private readonly config: PlyConfig;

    constructor(
        readonly workspaceFolder: vscode.WorkspaceFolder,
        readonly plyRoots: PlyRoots,
        readonly outputChannel: vscode.OutputChannel,
        readonly log: Log,
        readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>) {
            this.config = new PlyConfig(workspaceFolder, log);
    }

    /**
     * TODO: debugging is not supported as yet
     */
    async runTests(testIds: string[], debug = false): Promise<void> {
        this.testRunId++;
        const testRunId = `${this.testRunId}`;

        try {
            this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests: testIds, testRunId });

            const testInfos: TestInfo[] = [];
            for (const testId of testIds) {
                const testOrSuite = this.plyRoots.findTestOrSuiteInfo(testId);
                if (testOrSuite) {
                    this.collectTests(testOrSuite, testInfos);
                }
            }
            let plyees = testInfos.map(testInfo => {
                let uri = vscode.Uri.parse(testInfo.id);
                if (uri.scheme === 'file') {
                    let path = uri.fsPath;
                    if (uri.fragment) {
                        path += '#' + uri.fragment;
                    }
                    return path;
                }
                else {
                    return uri.toString(true);
                }
            });
            await this.runPlyees(plyees, debug);

            this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
        }
        catch (err) {
            if (this.log.enabled) {
                this.log.error(`Error while running plyees: ${inspect(err)}`);
            }
            this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
        }
    }

    async runPlyees(plyees: string[], debug = false): Promise<void> {

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

        let options = this.config.plyOptions;

        const workerArgs: WorkerArgs = {
            cwd: this.config.cwd,
            plyees,  // file locs and/or uris
            plyPath: this.config.plyPath,
            plyOptions: options,
            plyValues: plyValues,
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
                    if (this.log.enabled) {
                        this.log.info(`Worker: ${message}`);
                    }
                }
                else {
                    if (this.log.enabled) {
                        this.log.info(`Received ${JSON.stringify(message)}`);
                    }
                    if (message.type !== 'finished') {
                        this.testStatesEmitter.fire({ ...message as any, testRunId });
                        if (message.type === 'test') {
//                             runningTest = (typeof message.test === 'string') ? message.test : message.test.id;
                            if (message.state === 'running') {
                                runningTest = (typeof message.test === 'string') ? message.test : message.test.id;
                            } else {
                                runningTest = undefined;
                            }
                        }
                    }
                    else if (this.runningTestProcess) {
                        // TODO: ever need to kill?
                        // this.runningTestProcess.kill();
                    }
                }
            });

            const processOutput = (data: Buffer | string) => {

                this.outputChannel.append(data.toString());

                if (runningTest) {
                    this.testStatesEmitter.fire(<TestEvent>{
                        type: 'test',
                        state: 'running',
                        test: runningTest,
                        message: data.toString(),
                        testRunId
                    });
                }
            };

            this.runningTestProcess.stdout.on('data', processOutput);
            this.runningTestProcess.stderr.on('data', processOutput);

            this.runningTestProcess.on('exit', () => {
                if (this.log.enabled) {
                    this.log.info('Worker finished');
                }
                runningTest = undefined;
                this.runningTestProcess = undefined;
                if (!childProcessFinished) {
                    childProcessFinished = true;
                    this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
                    resolve();
                }
            });

            this.runningTestProcess.on('error', err => {
                if (this.log.enabled) {
                    this.log.error(`Error from child process: ${inspect(err)}`);
                }
                runningTest = undefined;
                this.runningTestProcess = undefined;
                if (!childProcessFinished) {
                    childProcessFinished = true;
                    this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished', testRunId });
                    resolve();
                }
            });
        });
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

    collectTests(testOrSuite: TestSuiteInfo | TestInfo, testInfos: TestInfo[]) {
        if (testOrSuite.type === 'suite') {
            for (const child of testOrSuite.children) {
                this.collectTests(child, testInfos);
            }
        } else {
            testInfos.push(testOrSuite);
        }
    }
}
