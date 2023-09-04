import * as vscode from 'vscode';
import * as path from 'path';
import { Fs } from './fs';
import * as ply from '@ply-ct/ply';
import { detectNodePath } from './test-adapter/util/misc';

export enum Setting {
    customSteps = 'customSteps',
    logPanel = 'logPanel',
    debugPort = 'debugPort',
    debugConfig = 'debugConfig',
    nodePath = 'nodePath',
    plyPath = 'plyPath',
    cwd = 'cwd',
    env = 'env',
    useDist = 'useDist',
    requireTsNode = 'requireTsNode',
    openRequestsAndFlowsWhenRun = 'openRequestsAndFlowsWhenRun',
    plyExplorerUseRequestEditor = 'plyExplorerUseRequestEditor',
    saveBeforeRun = 'saveBeforeRun',
    websocketPort = 'websocketPort',
    jsoncValuesFiles = 'jsoncValuesFiles'
}

export class PlyConfig {
    private _plyOptions: ply.PlyOptions | undefined;
    private configFileWatcher?: vscode.FileSystemWatcher;

    static getFileAssociations(): { [key: string]: string } | undefined {
        const fileAssociationsConfig = vscode.workspace.getConfiguration('files');
        return fileAssociationsConfig?.get<{ [key: string]: string } | undefined>('associations');
    }

    /**
     * Updates file associations only if newAssocs means changes
     */
    static async setFileAssociations(newAssocs: { [key: string]: string }) {
        const existingAssocs = PlyConfig.getFileAssociations();
        const fileAssociations = existingAssocs ? { ...existingAssocs, ...newAssocs } : newAssocs;
        if (JSON.stringify(fileAssociations) !== JSON.stringify(existingAssocs)) {
            // update if necessary
            const fileAssociationsConfig = vscode.workspace.getConfiguration('files');
            await fileAssociationsConfig.update('associations', fileAssociations);
        }
    }

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly reload?: () => Promise<void>
    ) {
        if (reload) {
            // register file watcher for plyconfig
            this.configFileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(this.workspaceFolder, '**/plyconfig.{yaml,yml,json}')
            );
            const reactToPlyConfig = () => {
                this.clearPlyOptions();
                reload();
            };
            this.configFileWatcher.onDidCreate(reactToPlyConfig);
            this.configFileWatcher.onDidChange(reactToPlyConfig);
            this.configFileWatcher.onDidDelete(reactToPlyConfig);
        }
    }

    private getConfiguration(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('ply', this.workspaceFolder.uri);
    }

    async onChange(change: vscode.ConfigurationChangeEvent) {
        for (const setting of Object.values(Setting)) {
            if (change.affectsConfiguration(`ply.${setting}`, this.workspaceFolder.uri)) {
                console.debug(`config change affects ply.${setting}`);
                if (
                    setting === Setting.customSteps ||
                    setting === Setting.nodePath ||
                    setting === Setting.plyPath ||
                    setting === Setting.env
                ) {
                    this._plyOptions = undefined;
                    if (this.reload) this.reload();
                }
            }
        }
    }

    /**
     * ply path without /dist
     */
    get plyPath(): string {
        let plyPath = this.getConfiguration().get<string>(Setting.plyPath);
        if (plyPath) {
            plyPath = path.resolve(this.workspaceFolder.uri.fsPath, plyPath);
        } else {
            plyPath = path.dirname(require.resolve('@ply-ct/ply'));
        }
        if (plyPath.endsWith('/') || plyPath.endsWith('\\')) {
            plyPath = plyPath.substring(0, plyPath.length - 1);
        }
        if (plyPath.endsWith('/dist') || plyPath.endsWith('\\dist')) {
            return plyPath.substring(0, plyPath.length - 5);
        }
        return plyPath;
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

    get requireTsNode(): boolean | undefined {
        return this.getConfiguration().get(Setting.requireTsNode, false);
    }

    get jsoncValuesFiles(): boolean {
        return this.getConfiguration().get(Setting.jsoncValuesFiles, true);
    }

    get plyExplorerUseRequestEditor(): boolean {
        return this.getConfiguration().get(Setting.plyExplorerUseRequestEditor, false);
    }
    get openRequestsAndFlowsWhenRun(): string {
        return this.getConfiguration().get(Setting.openRequestsAndFlowsWhenRun, 'If Single');
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
                } else {
                    return ply.util.fwdSlashes(path.normalize(workspacePath + '/' + location));
                }
            };
            options = Object.assign({}, options, {
                // these are the options NO LONGER overridable by settings
                // TODO: why make everything absolute?
                testsLocation: abs(options.testsLocation),
                requestFiles: options.requestFiles,
                caseFiles: options.caseFiles,
                flowFiles: options.flowFiles,
                ignore: options.ignore,
                skip: options.skip,
                expectedLocation: abs(options.expectedLocation),
                actualLocation: abs(options.actualLocation),
                logLocation: abs(options.logLocation || options.actualLocation),
                valuesFiles: Object.keys(options.valuesFiles).reduce(
                    (vfObj: { [file: string]: boolean }, vf: string) => {
                        vfObj[abs(vf)] = options.valuesFiles[vf];
                        return vfObj;
                    },
                    {}
                )
            });
            // console.trace(`plyOptions: ${JSON.stringify(options)}`);
            this._plyOptions = options;
        }

        return this._plyOptions!;
    }

    async updatePlyConfig(delta: { [key: string]: any }) {
        const indent = this.plyOptions.prettyIndent || 2;
        let configFile = this.configFile;
        if (configFile) {
            const fs = new Fs(configFile);
            const configContent = await fs.readTextFile();
            let mergedConfig: string;
            if (configFile.endsWith('.json')) {
                mergedConfig = ply.mergeJson(configFile, configContent, delta, indent);
            } else {
                mergedConfig = ply.mergeYaml(configFile, configContent, delta, indent);
            }
            await fs.writeFile(mergedConfig);
        } else {
            configFile = this.defaultFile;
            await new Fs(configFile).writeFile(ply.dumpYaml(delta, indent));
        }
    }

    get configFile(): string | undefined {
        return ply.PLY_CONFIGS.map((plyConfig) =>
            path.join(this.workspaceFolder.uri.fsPath, plyConfig)
        ).find((file) => new Fs(file).existsSync());
    }

    get defaultFile(): string {
        return path.join(this.workspaceFolder.uri.fsPath, 'plyconfig.yaml');
    }

    clearPlyOptions() {
        this._plyOptions = undefined;
    }

    dispose() {
        this.configFileWatcher?.dispose();
        this.clearPlyOptions();
    }
}
