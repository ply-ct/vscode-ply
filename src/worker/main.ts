import * as path from 'path';
import * as flowbee from 'flowbee';
import { WorkerArgs } from './args';
// events API must stay compatible
import * as ply from '@ply-ct/ply';

(async () => {
    if (process.send) {
        const args = await new Promise<WorkerArgs>((resolve) => {
            process.once('message', resolve);
        });
        execute(args, async (msg) => process.send!(msg));
    } else {
        execute(JSON.parse(process.argv[3]), async (msg) => console.log(msg));
    }
})();

/**
 * Console output from here goes to Ply Tests output channel.
 */
function execute(
    args: WorkerArgs,
    sendMessage: (message: any) => Promise<boolean | void>,
    onFinished?: () => void
): void {
    const startTimes = new Map<string, number>();
    function elapsed(id: string): string | undefined {
        if (startTimes.has(id)) {
            const elapsed = Date.now() - startTimes.get(id)!;
            startTimes.delete(id);
            return `${elapsed} ms`;
        }
    }

    try {
        process.chdir(args.cwd);

        for (const envVar in args.env) {
            process.env[envVar] = args.env[envVar];
        }

        let Plier: typeof import('@ply-ct/ply').Plier;

        if (args.plyPath) {
            // override built-in ply
            if (args.logEnabled) {
                sendMessage(`Using ply package at ${args.plyPath}`);
            }
            Plier = require(path.join(args.plyPath, 'dist')).Plier;
        } else {
            Plier = ply.Plier;
        }

        const plier = new Plier(args.plyOptions);

        const cwd = process.cwd();
        module.paths.push(cwd, path.join(cwd, 'node_modules'));

        plier.on('suite', (suiteEvent: ply.SuiteEvent) => {
            const suiteId = `${suiteEvent.type}s|${getUri(suiteEvent.plyee)}`;
            if (suiteEvent.status === 'Started') {
                startTimes.set(suiteId, Date.now());
            }
            sendMessage({
                type: 'suite',
                suite: suiteId,
                state: mapStatus(suiteEvent.status)
            });
        });
        plier.on('test', (plyEvent: ply.PlyEvent) => {
            const testId = getUri(plyEvent.plyee);
            startTimes.set(testId, Date.now());
            const msg = {
                type: 'test',
                test: testId,
                state: 'running'
            } as any;
            sendMessage(msg);
        });
        plier.on('outcome', (outcomeEvent: ply.OutcomeEvent) => {
            let testId = getUri(outcomeEvent.plyee);
            // request steps in subflows have hyphens instead of dots separating f and s (why?)
            const hash = testId.lastIndexOf('#');
            if (hash > 0) {
                const hyphen = testId.lastIndexOf('-');
                if (hyphen > hash && hyphen < testId.length - 1) {
                    testId = testId.substring(0, hyphen) + '.' + testId.substring(hyphen + 1);
                }
            }
            sendMessage({
                type: 'test',
                test: testId,
                state: mapStatus(outcomeEvent.outcome.status),
                message: outcomeEvent.outcome.message,
                description: elapsed(testId),
                diffs: outcomeEvent.outcome.diffs
            });
        });
        plier.on('flow', (flowEvent: flowbee.FlowEvent) => {
            sendMessage({
                type: 'flow',
                flowEvent
            });
        });
        plier.on('error', (err: Error) => {
            if (args.logEnabled) {
                console.error(err);
                sendMessage(`Caught error ${err.stack}`);
            }
        });

        if (args.logEnabled) {
            sendMessage('Running plyees');
        }

        plier
            .run(args.plyees, args.runOptions, args.plyVersion)
            .then(() => {
                sendMessage({ type: 'finished' });
                if (onFinished) {
                    onFinished();
                }
            })
            .catch((err: Error) => {
                console.error(err);
                if (args.logEnabled) {
                    console.error(err);
                    sendMessage(`Caught error ${err.stack}`);
                }
            });
    } catch (err: unknown) {
        console.error(err);
        if (args.logEnabled) {
            console.error(err);
            sendMessage(`Caught error ${(err as Error).stack}`);
        }
    }
}

function mapStatus(
    status: String | undefined
): 'running' | 'completed' | 'passed' | 'skipped' | 'failed' | 'errored' {
    if (status === 'Started') {
        return 'running';
    } else if (status === 'Finished') {
        return 'completed';
    } else if (status === 'Passed') {
        return 'passed';
    } else if (status === 'Submitted') {
        return 'skipped';
    } else if (status === 'Failed') {
        return 'failed';
    } else {
        return 'errored';
    }
}

function getUri(plyee: string) {
    if (plyee.startsWith('https://') || plyee.startsWith('http://')) {
        return plyee;
    } else {
        return `file://${process.platform.startsWith('win') ? '/' : ''}${plyee}`;
    }
}
