import * as path from 'path';
import * as util from 'util';
import { WorkerArgs } from './args';
import { PlyEvent, OutcomeEvent } from 'ply-ct';

(async () => {

    if (process.send) {
        const args = await new Promise<WorkerArgs>(resolve => {
            process.once('message', resolve);
        });
        execute(args, async msg => process.send!(msg));
    }
    else {
        execute(JSON.parse(process.argv[3]), async msg => console.log(msg));
    }
})();

/**
 * Console output from here goes to Ply Tests output channel.
 */
function execute(args: WorkerArgs, sendMessage: (message: any) => Promise<void>, onFinished?: () => void): void {

    try {
        process.chdir(args.cwd);

        const plyPath = args.plyPath ? args.plyPath : path.dirname(require.resolve('ply-ct'));
        if (args.logEnabled) {
            sendMessage(`Using ply package at ${plyPath}`);
        }

        const Plyer: typeof import('ply-ct').Plyer = require(plyPath + '/index.js').Plyer;
        const plyer = new Plyer(args.plyOptions);

        const cwd = process.cwd();
        module.paths.push(cwd, path.join(cwd, 'node_modules'));

        plyer.on('start', (plyEvent: PlyEvent) => {
            sendMessage({
                type: 'test',
                test: getTestId(plyEvent.plyee),
                state: 'running'
            });
        });
        plyer.on('outcome', (outcomeEvent: OutcomeEvent) => {
            sendMessage({
                type: 'test',
                test: getTestId(outcomeEvent.plyee),
                state: mapStatus(outcomeEvent.outcome.status),
                description: outcomeEvent.outcome.message
            });
        });
        plyer.on('error', (err: Error) => {
            if (args.logEnabled) {
                sendMessage(`Caught error ${util.inspect(err)}`);
            }
        });

        if (args.logEnabled) {
            sendMessage('Running plyees');
        }

        plyer.run(args.plyees, args.plyValues)
        .then(() => {
            sendMessage({ type: 'finished' });
            if (onFinished) {
                onFinished();
            }
        })
        .catch((err: Error) => {
            console.error(err);
            if (args.logEnabled) {
                sendMessage(`Caught error ${util.inspect(err)}`);
            }
        });
    }
    catch (err) {
        console.error(err);
        if (args.logEnabled) {
            sendMessage(`Caught error ${util.inspect(err)}`);
        }
    }
}

function mapStatus(status: String | undefined): 'passed' | 'failed' | 'errored' {
    if (status === 'Passed') {
        return 'passed';
    }
    else if (status === 'Failed') {
        return 'failed';
    }
    else {
        return 'errored';
    }
}

function getTestId(plyee: string) {
    if (plyee.startsWith('https://') || plyee.startsWith('http://')) {
        return plyee;
    }
    else {
        return 'file:///' + plyee;
    }
}
