import * as vscode from 'vscode';
import * as path from 'path';
import { detectNodePath, Log } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';

export enum Setting {
    testsLocation = 'testsLocation',
    requestFiles = 'requestFiles',
    caseFiles = 'caseFiles',
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
    importCaseModulesFromBuilt = 'importCaseModulesFromBuilt'
}

export class PlyConfig {

    private _plyOptions: ply.PlyOptions | undefined;

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly reload: () => Promise<void>,
        private readonly retire: () => void,
        private readonly resetDiffs: () => void,
        private readonly log: Log
    ) { }

    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri);
    }

    async onChange(change: vscode.ConfigurationChangeEvent) {
        this.log.info('config change');
        for (const setting of Object.values(Setting)) {
            if (change.affectsConfiguration(`ply.${setting}`, this.workspaceFolder.uri)) {
                this.log.info(`config change affects ply.${setting}`);
                if (setting === Setting.testsLocation
                    || setting === Setting.requestFiles
                    || setting === Setting.caseFiles
                    || setting === Setting.excludes
                    || setting === Setting.nodePath
                    || setting === Setting.plyPath
                    || setting === Setting.importCaseModulesFromBuilt) {
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
        this.log.debug(`Node path: ${nodePath}`);
        return nodePath;
    }

    get cwd(): string {
        const dirname = this.workspaceFolder.uri.fsPath;
        const configCwd = this.getConfiguration().get<string>(Setting.cwd);
        const cwd = configCwd ? path.resolve(dirname, configCwd) : dirname;
        this.log.debug(`Working directory: ${cwd}`);
        return cwd;
    }

    get debugPort(): number {
        const debugPort = this.getConfiguration().get(Setting.debugPort, 9229);
        this.log.debug(`Debug port: ${debugPort}`);
        return debugPort;
    }

    get debugConfig(): string | undefined {
        const debugConfig = this.getConfiguration().get(Setting.debugConfig, '');
        this.log.debug(`Debug config: ${debugConfig}`);
        return debugConfig ? debugConfig : undefined;
    }

    get importCaseModulesFromBuilt(): boolean {
        return this.getConfiguration().get(Setting.importCaseModulesFromBuilt, false);
    }

    /**
     * All locations are made normalized, absolute where relative is relative to workspace folder.
     * PlyOptions are cached.
     */
    get plyOptions(): ply.PlyOptions {
        if (!this._plyOptions) {
            const workspacePath = ply.util.fwdSlashes(this.workspaceFolder.uri.fsPath);
            let options = new ply.Config(new ply.Defaults(workspacePath), false).options;
            const abs = (location: string) => {
                if (path.isAbsolute(location)) {
                    return ply.util.fwdSlashes(path.normalize(location));
                }
                else {
                    return ply.util.fwdSlashes(path.normalize(workspacePath + '/' + location));
                }
            };
            const val = (name: string, defaultVal: string): string => {
                const val = this.getConfiguration().get(name, '');
                return val ? val  : defaultVal;
            };
            const bool = (name: string, defaultValue: boolean): boolean => {
                const bool = this.getConfiguration().get(name, undefined);
                return typeof bool === 'undefined' ? defaultValue : bool as boolean;
            };
            options = Object.assign({}, options, {
                testsLocation: abs(val('testsLocation', options.testsLocation)),
                requestFiles: val('requestFiles', options.requestFiles),
                caseFiles: val('caseFiles', options.caseFiles),
                excludes: val('excludes', options.excludes),
                expectedLocation: abs(val('expectedLocation', options.expectedLocation)),
                actualLocation: abs(val('actualLocation', options.actualLocation)),
                logLocation: abs(val('logLocation', options.logLocation || options.actualLocation)),
                verbose: bool('verbose', options.verbose)
            });
            this.log.debug(`plyOptions: ${JSON.stringify(options)}`);
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
        return ['.plyrc.yaml', '.plyrc.yml', '.plyrc.json'].includes(path.basename(file));
    }
}