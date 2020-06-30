import * as vscode from 'vscode';
import * as path from 'path';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';

export class PlyConfig {

    constructor(private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly log?: Log) {
    }

    get plyPath(): string {
        let plyPath = vscode.workspace.getConfiguration().get<string | null>('ply.plyPath');
        if (plyPath) {
            return path.resolve(this.workspaceFolder.uri.fsPath, plyPath);
        } else {
            return path.dirname(require.resolve('ply-ct'));
        }
    }

    async getNodePath(): Promise<string | undefined> {
        let nodePath = vscode.workspace.getConfiguration().get<string | null>('ply.nodePath') || undefined;
        if (nodePath === 'default') {
            nodePath = await detectNodePath();
        }
        if (this.log && this.log.enabled) {
            this.log.debug(`Node path: ${nodePath}`);
        }
        return nodePath;
    }

    get cwd(): string {
        const dirname = this.workspaceFolder.uri.fsPath;
        const configCwd = vscode.workspace.getConfiguration().get<string>('ply.cwd');
        const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
        if (this.log && this.log.enabled) {
            this.log.debug(`Working directory: ${cwd}`);
        }
        return cwd;
    }

    get debugPort(): number {
        const debugPort = vscode.workspace.getConfiguration().get('ply.debugPort', 9229);
        if (this.log && this.log.enabled) {
            this.log.debug(`Debug port: ${debugPort}`);
        }
        return debugPort;
    }

    /**
     * All locations are made normalized, absolute where relative is relative to workspace folder.
     */
    get plyOptions(): ply.PlyOptions {

        const workspacePath = this.workspaceFolder.uri.fsPath.replace(/\\/g, '/');
        let options = new ply.Config(new ply.Defaults(workspacePath)).options;
        let abs = (location: string) => {
            if (path.isAbsolute(location)) {
                return path.normalize(location).replace(/\\/g, '/');
            }
            else {
                return path.normalize(workspacePath + '/' + location).replace(/\\/g, '/');
            }
        };
        options = Object.assign({}, options, {
            testsLocation: abs(vscode.workspace.getConfiguration().get('ply.testsLocation', options.testsLocation)),
            expectedLocation: abs(options.expectedLocation),
            actualLocation: abs(options.actualLocation),
            logLocation: options.logLocation ? abs(options.logLocation) : undefined,
            requestFiles: vscode.workspace.getConfiguration().get('ply.requestFiles', options.requestFiles),
            caseFiles: vscode.workspace.getConfiguration().get('ply.caseFiles', options.caseFiles),
            excludes: vscode.workspace.getConfiguration().get('ply.excludes', options.excludes)
        });

        return options;
    }
}