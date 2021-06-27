import * as vscode from 'vscode';
import * as path from 'path';
import { detectNodePath } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';

export enum Setting {
    testsLocation = 'testsLocation',
    requestFiles = 'requestFiles',
    caseFiles = 'caseFiles',
    flowFiles = 'flowFiles',
    excludes = 'excludes',
    expectedLocation = 'expectedLocation',
    actualLocation = 'actualLocation',
    logLocation = 'logLocation',
    logPanel = 'logPanel',
    debugPort = 'debugPort',
    debugConfig = 'debugConfig',
    nodePath = 'nodePath',
    plyPath = 'plyPath',
    cwd = 'cwd',
    env = 'env',
    useDist = 'useDist',
    openFlowWhenRun = 'openFlowWhenRun',
    saveBeforeRun = 'saveBeforeRun',
    websocketPort = 'websocketPort'
}

export class PlyConfig {

    private _plyOptions: ply.PlyOptions | undefined;

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly reload: () => Promise<void> = async () => {},
        private readonly retire: () => void = () => {},
        private readonly resetDiffs: () => void = () => {},
    ) { }

    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri);
    }

    async onChange(change: vscode.ConfigurationChangeEvent) {
        console.debug('config change');
        for (const setting of Object.values(Setting)) {
            if (change.affectsConfiguration(`ply.${setting}`, this.workspaceFolder.uri)) {
                console.debug(`config change affects ply.${setting}`);
                if (setting === Setting.testsLocation
                    || setting === Setting.requestFiles
                    || setting === Setting.caseFiles
                    || setting === Setting.flowFiles
                    || setting === Setting.excludes
                    || setting === Setting.nodePath
                    || setting === Setting.plyPath) {
                    this._plyOptions = undefined;
                    this.reload();
                    this.retire();
                }
                else if (setting === Setting.expectedLocation
                    || setting === Setting.actualLocation) {
                    this._plyOptions = undefined;
                    this.resetDiffs();
                    this.retire();
                }
            }
        }
    }

    get plyPath(): string {
        const plyPath = this.getConfiguration().get<string>(Setting.plyPath);
        if (plyPath) {
            return path.resolve(this.workspaceFolder.uri.fsPath, plyPath);
        } else {
            return path.dirname(require.resolve('ply-ct'));
        }
    }

    async getNodePath(): Promise<string | undefined> {
        let nodePath = this.getConfiguration().get<string>(Setting.nodePath);
        if (!nodePath) {
            nodePath = await detectNodePath();
        }
        console.debug(`Node path: ${nodePath}`);
        return nodePath;
    }

    get cwd(): string {
        const dirname = this.workspaceFolder.uri.fsPath;
        const configCwd = this.getConfiguration().get<string>(Setting.cwd);
        const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
        console.debug(`Working directory: ${cwd}`);
        return cwd;
    }

    get env(): { [name: string]: string } {
        return this.getConfiguration().get(Setting.env) || {};
    }

    get debugPort(): number {
        const debugPort = this.getConfiguration().get(Setting.debugPort, 9229);
        console.debug(`Debug port: ${debugPort}`);
        return debugPort;
    }

    get debugConfig(): string | undefined {
        const debugConfig = this.getConfiguration().get(Setting.debugConfig, '');
        console.debug(`Debug config: ${debugConfig}`);
        return debugConfig ? debugConfig : undefined;
    }

    get useDist(): boolean {
        return this.getConfiguration().get(Setting.useDist, false);
    }

    get openFlowWhenRun(): string {
        return this.getConfiguration().get(Setting.openFlowWhenRun, 'If Single');
    }

    get saveBeforeRun(): boolean {
        return this.getConfiguration().get(Setting.saveBeforeRun, false);
    }

    val(name: string, defaultVal: string): string {
        const val = this.getConfiguration().get(name, '');
        return val ? val : defaultVal;
    }

    arr(name: string, defaultValue: string[]): string[] {
        const arr = this.getConfiguration().get(name, []);
        return arr.length ? arr : defaultValue;
    }

    /**
     * All locations are made normalized, absolute where relative is relative to workspace folder.
     * PlyOptions are cached.
     */
    get plyOptions(): ply.PlyOptions {
        if (!this._plyOptions) {
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
            options = Object.assign({}, options, {
                // these are the options overridable by settings
                testsLocation: abs(this.val('testsLocation', options.testsLocation)),
                requestFiles: this.val('requestFiles', options.requestFiles),
                caseFiles: this.val('caseFiles', options.caseFiles),
                flowFiles: this.val('flowFiles', options.flowFiles),
                ignore: this.val('ignore', options.ignore),
                skip: this.val('skip', options.skip),
                expectedLocation: abs(this.val('expectedLocation', options.expectedLocation)),
                actualLocation: abs(this.val('actualLocation', options.actualLocation)),
                logLocation: abs(this.val('logLocation', options.logLocation || options.actualLocation)),
                // valuesFiles is not a config prop in package.json
                valuesFiles: options.valuesFiles.map(vf => abs(vf))
            });
            console.debug(`plyOptions: ${JSON.stringify(options)}`);
            this._plyOptions = options;
        }

        return this._plyOptions!;
    }

    clearPlyOptions() {
        this.resetDiffs();
        this._plyOptions = undefined;
    }

    dispose() {
        this.clearPlyOptions();
    }

    static isPlyConfig(file: string) {
        return ply.PLY_CONFIGS.includes(path.basename(file));
    }
}