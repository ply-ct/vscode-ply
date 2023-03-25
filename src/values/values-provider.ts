import * as vscode from 'vscode';
import { ValuesFile } from './values-file';
import { Values } from './values';
import { Log } from '../test-adapter/util/log';

/**
 * Ply config must reside in root of workspace folder.
 */
export class PlyValuesProvider implements vscode.TreeDataProvider<ValuesFile> {
    private _onDidChangeTreeData: vscode.EventEmitter<ValuesFile | undefined | void> =
        new vscode.EventEmitter<ValuesFile | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ValuesFile | undefined | void> =
        this._onDidChangeTreeData.event;

    private workspaceRoot: string;

    constructor(private resourceBase: string, private values: Values, private log: Log) {
        this.workspaceRoot = values.workspaceFolder.uri.fsPath;
        this.values.onValuesUpdate((updateEvent) => {
            if (!updateEvent.resultUri) {
                // potential plyconfig change
                this.refresh();
            }
        });
    }

    async getTreeItem(element: ValuesFile): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: ValuesFile): Promise<ValuesFile[]> {
        if (element) {
            throw new Error(`Parent element should not be provided: ${element.file}`);
        }

        vscode.commands.executeCommand('setContext', 'valuesLoading', true);
        const before = Date.now();
        const valuesFiles = await this.getValuesFiles();
        this.log.info(`Loaded values data in ${Date.now() - before} ms`);
        vscode.commands.executeCommand('setContext', 'valuesLoading', false);
        return valuesFiles;
    }

    async getValuesFiles(): Promise<ValuesFile[]> {
        const valuesFiles = this.values.valuesFiles;
        return Object.keys(valuesFiles).map((vf) => {
            const relPath = vscode.workspace.asRelativePath(vf);
            return new ValuesFile(
                this.resourceBase,
                vscode.Uri.file(vf),
                relPath,
                valuesFiles[vf] || false
            );
        });
    }

    getParent(_element: ValuesFile): vscode.ProviderResult<ValuesFile> {
        return null;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
