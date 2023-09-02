import * as path from 'path';
import * as vscode from 'vscode';
import { Fs } from '../fs';
import { ValuesFile, ValuesRoot } from './values-file';
import { PlyValuesProvider } from './values-provider';
import { Log } from '../test-adapter/util/log';

/**
 * Ply config must reside in root of workspace folder.
 */
export class PlyValuesTree {
    private treeView: vscode.TreeView<ValuesRoot | ValuesFile>;
    dataProvider: PlyValuesProvider;

    constructor(readonly context: vscode.ExtensionContext, log: Log) {
        this.dataProvider = new PlyValuesProvider(context.asAbsolutePath('.'), log);

        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.reload', () => {
                this.dataProvider.refresh();
            })
        );

        const openConfig = async (workspaceFolder = '') => {
            const config = this.dataProvider.getConfig(workspaceFolder);
            if (config?.configFile) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(config.configFile));
            }
        };

        context.subscriptions.push(
            vscode.commands.registerCommand(
                'ply.values.open-file',
                async (item: ValuesRoot | ValuesFile) => {
                    const valuesFileUri = (item as ValuesFile).uri;
                    if (valuesFileUri && (await new Fs(valuesFileUri).exists())) {
                        // TODO scroll to line number
                        vscode.commands.executeCommand('vscode.open', valuesFileUri);
                    } else {
                        openConfig((item as ValuesRoot).workspaceFolder);
                    }
                }
            )
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.open-config', async () => {
                const workspaceFolders = vscode.workspace.workspaceFolders || [];
                if (workspaceFolders.length === 1) {
                    openConfig(path.basename(workspaceFolders[0].uri.fsPath));
                }
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.select', async (valuesFile: ValuesFile) => {
                await valuesFile.onSelect(valuesFile);
            })
        );

        this.treeView = vscode.window.createTreeView('ply-values', {
            treeDataProvider: this.dataProvider
        });
    }
}
