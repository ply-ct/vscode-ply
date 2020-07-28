import * as vscode from 'vscode';
import * as path from 'path';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';

export class PlyConfig {

    constructor(private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly log?: Log) {
    }

    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri);
    }

    async onChange(change: vscode.ConfigurationChangeEvent) {

    }

    get plyPath(): string {
        const plyPath = vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get<string>('plyPath');
        if (plyPath) {
            return path.resolve(this.workspaceFolder.uri.fsPath, plyPath);
        } else {
            return path.dirname(require.resolve('ply-ct'));
        }
    }

    async getNodePath(): Promise<string | undefined> {
        let nodePath = vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get<string>('nodePath');
        if (!nodePath) {
            nodePath = await detectNodePath();
        }
        if (this.log && this.log.enabled) {
            this.log.debug(`Node path: ${nodePath}`);
        }
        return nodePath;
    }

    get cwd(): string {
        const dirname = this.workspaceFolder.uri.fsPath;
        const configCwd = vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get<string>('cwd');
        const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
        if (this.log && this.log.enabled) {
            this.log.debug(`Working directory: ${cwd}`);
        }
        return cwd;
    }

    get debugPort(): number {
        const debugPort = vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get('debugPort', 9229);
        if (this.log && this.log.enabled) {
            this.log.debug(`Debug port: ${debugPort}`);
        }
        return debugPort;
    }

    get debugConfig(): string | undefined {
        const debugConfig = vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get<string>('debugConfig');
        if (debugConfig && this.log && this.log.enabled) {
            this.log.debug(`Debug config: ${debugConfig}`);
        }
        return debugConfig;
    }

    get importCaseModulesFromBuilt(): boolean {
        return vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get('importCaseModulesFromBuilt', false);
    }

    /**
     * All locations are made normalized, absolute where relative is relative to workspace folder.
     */
    get plyOptions(): ply.PlyOptions {

        const workspacePath = ply.util.fwdSlashes(this.workspaceFolder.uri.fsPath);
        let options = new ply.Config(new ply.Defaults(workspacePath)).options;
        const abs = (location: string) => {
            if (path.isAbsolute(location)) {
                return ply.util.fwdSlashes(path.normalize(location));
            }
            else {
                return ply.util.fwdSlashes(path.normalize(workspacePath + '/' + location));
            }
        };
        const val = (name: string, defaultVal: string): string => {
            const val = vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri).get(name, '');
            return val ? val  : defaultVal;
        };
        options = Object.assign({}, options, {
            testsLocation: abs(val('testsLocation', options.testsLocation)),
            requestFiles: val('requestFiles', options.requestFiles),
            caseFiles: val('caseFiles', options.caseFiles),
            excludes: val('excludes', options.excludes),
            expectedLocation: abs(val('expectedLocation', options.expectedLocation)),
            actualLocation: abs(val('actualLocation', options.actualLocation)),
            logLocation: abs(val('logLocation', options.logLocation || options.actualLocation))
        });

        return options;
    }
}