import * as os from 'os';
import { exec } from 'child_process';

/**
 * get the absolute path of the node executable on the user's PATH
 */
export async function detectNodePath(): Promise<string | undefined> {
    try {
        if (os.platform() === 'win32') {
            const result = await execPromise('where node');
            return result ? result.trim().split('\r\n')[0] : undefined;
        } else {
            const result = await execPromise('which node');
            return result ? result.trim() : undefined;
        }
    } catch (e: unknown) {
        return undefined;
    }
}

/**
 * Execute child_process.exec() and return a Promise that resolves to the output of the child process
 * @param cmd - the command to execute - passed to child_process.exec()
 */
function execPromise(cmd: string): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve, reject) => {
        exec(cmd, (err, stdout) => {
            if (err) {
                reject(err);
            } else {
                resolve(stdout);
            }
        });
    });
}
