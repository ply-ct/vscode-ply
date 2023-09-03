import * as path from 'path';
import * as vscode from 'vscode';
import { ValuesFile, ValuesRoot } from './values-file';
import { Values } from './values';
import { Log } from '../test-adapter/util/log';
import { PlyAdapter } from '../adapter';
import { Disposable } from '@ply-ct/ply-api';
import { PlyConfig } from '../config';

export class PlyValuesProvider implements vscode.TreeDataProvider<ValuesRoot | ValuesFile> {
    private _onDidChangeTreeData: vscode.EventEmitter<ValuesRoot | ValuesFile | undefined | void> =
        new vscode.EventEmitter<ValuesRoot | ValuesFile | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ValuesRoot | ValuesFile | undefined | void> =
        this._onDidChangeTreeData.event;

    private valuesRoots: ValuesRoot[] = [];
    private workspaceFolderValues = new Map<string, Values>();
    private disposables = new Map<string, Disposable>();

    constructor(private resourceBase: string, private log: Log) {}

    register(adapter: PlyAdapter) {
        const folder = path.basename(adapter.workspaceFolder.uri.fsPath);
        adapter.onceValues(({ values }) => {
            this.workspaceFolderValues.set(folder, values);
            this.disposables.set(
                folder,
                values.onValuesUpdate((valuesUpdate) => {
                    if (!valuesUpdate.resultUri) {
                        // potential config change
                        this.refresh(folder);
                    }
                })
            );

            this.refresh();
            vscode.commands.executeCommand('setContext', 'ply.values.showTree', true);
        });
    }

    unregister(workspaceFolderUri: vscode.Uri) {
        const folder = path.basename(workspaceFolderUri.fsPath);
        this.disposables.get(folder)?.dispose();
        if (this.workspaceFolderValues.delete(folder)) {
            this.refresh();
        }
    }

    async getTreeItem(element: ValuesFile): Promise<vscode.TreeItem> {
        return element;
    }

    async getChildren(valuesRoot?: ValuesRoot): Promise<ValuesFile[] | ValuesRoot[]> {
        const folders = Array.from(this.workspaceFolderValues.keys());
        if (valuesRoot) {
            return await this.getValuesFiles(valuesRoot.workspaceFolder);
        } else {
            vscode.commands.executeCommand('setContext', 'ply.values.multiRoots', false);
            if (folders.length === 0) return [];
            if (folders.length === 1) {
                return await this.getValuesFiles(folders[0]);
            } else {
                vscode.commands.executeCommand('setContext', 'ply.values.multiRoots', true);
                this.valuesRoots = folders.map((f) => new ValuesRoot(f));
                return this.valuesRoots;
            }
        }
    }

    async getValuesFiles(workspaceFolder: string): Promise<ValuesFile[]> {
        const values = this.workspaceFolderValues.get(workspaceFolder);
        if (values) {
            const before = Date.now();
            const vfs = Object.keys(values.valuesFiles).map((vf) => {
                const relPath = vscode.workspace.asRelativePath(vf, false);
                return new ValuesFile(
                    this.resourceBase,
                    vscode.Uri.file(vf),
                    workspaceFolder,
                    relPath,
                    values.valuesFiles[vf] || false,
                    async (valuesFile) => {
                        await this.onFileSelect(valuesFile);
                    }
                );
            });
            this.log.info(`Loaded values for ${workspaceFolder} in ${Date.now() - before} ms`);
            return vfs;
        } else {
            return [];
        }
    }

    getConfig(workspaceFolder: string): PlyConfig | undefined {
        return this.workspaceFolderValues.get(workspaceFolder)?.config;
    }

    async onFileSelect(valuesFile: ValuesFile) {
        const values = this.workspaceFolderValues.get(valuesFile.folder);
        if (values) {
            const checked = !valuesFile.checked;
            const valuesFiles = values.setValuesFile(valuesFile.file, checked);
            // TODO: https://github.com/microsoft/vscode/issues/173233
            this.refresh(valuesFile.folder);
            // update plyconfig
            await values.config.updatePlyConfig({ valuesFiles });
        }
    }

    refresh(workspaceFolder?: string): void {
        let valuesRoot;
        if (workspaceFolder) {
            valuesRoot = this.valuesRoots.find((vr) => vr.workspaceFolder === workspaceFolder);
        }
        this._onDidChangeTreeData.fire(valuesRoot);
    }
}
