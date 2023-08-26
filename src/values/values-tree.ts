import * as path from 'path';
import * as vscode from 'vscode';
import { Fs } from '../fs';
import { WorkspaceFiles } from '../util/files';
import { Values } from './values';
import { ValuesFile } from './values-file';
import { PlyValuesProvider } from './values-provider';
import { Log } from '../test-adapter/util/log';

/**
 * Ply config must reside in root of workspace folder.
 */
export class PlyValuesTree {
    private treeView: vscode.TreeView<ValuesFile>;
    private dataProvider: PlyValuesProvider;

    constructor(readonly context: vscode.ExtensionContext, values: Values, log: Log) {
        this.dataProvider = new PlyValuesProvider(context.asAbsolutePath('.'), values, log);

        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.reload', () => {
                this.dataProvider.refresh();
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.open-config', async () => {
                let configFile = values.config.configFile;
                if (configFile) {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configFile));
                    // TODO: scroll based on line num in cached vals
                } else {
                    configFile = values.config.defaultFile;
                    await new Fs(configFile).writeFile('');
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configFile));
                }
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.new', async () => {
                const plyPath = values.config.plyPath;
                const files = new WorkspaceFiles(
                    values.workspaceFolder.uri,
                    path.join(plyPath, 'templates')
                );
                const valuesFile = await files.createFile({
                    dirpath: '.',
                    template: path.join('blank.json'),
                    filters: { 'Ply Values File': ['json'] },
                    doOpen: true
                });
                if (valuesFile) {
                    const valuesFiles = values.setValuesFile(valuesFile, true);
                    values.config.updatePlyConfig({ valuesFiles });
                }
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.select', async (valuesFile) => {
                const checked = !valuesFile.checked;
                const valuesFiles = values.setValuesFile(valuesFile.file, checked);
                this.dataProvider.refresh();

                // update plyconfig
                values.config.updatePlyConfig({ valuesFiles });
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('ply.values.open-file', async (valuesFile) => {
                if (await new Fs(valuesFile.uri.fsPath).exists()) {
                    vscode.commands.executeCommand('vscode.open', valuesFile.uri);
                }
            })
        );

        this.treeView = vscode.window.createTreeView('ply-values', {
            treeDataProvider: this.dataProvider
        });
    }
}
