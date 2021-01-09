import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { Log } from 'vscode-test-adapter-util';
import { PlyConfig } from './config';

export class Postman {
    constructor(readonly log: Log) { }

    async import(...args: any[]) {
        try {
            let workspaceFolder: vscode.WorkspaceFolder | undefined = undefined;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length === 1) {
                workspaceFolder = workspaceFolders[0];
            }

            if (args && args.length > 0 && args[0].adapterIds && args[0].adapterIds.length > 0) {
                const id = args[0].adapterIds[0];
                if (id.startsWith('Ply:')) {
                    workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(id.substring(4)));
                }
            }

            if (!workspaceFolder) {
                workspaceFolder = await vscode.window.showWorkspaceFolderPick({
                    placeHolder: 'Select destination workspace folder',
                    ignoreFocusOut: true
                });
            }

            if (workspaceFolder) {
                const uris = await vscode.window.showOpenDialog({
                    openLabel: 'Import',
                    canSelectMany: true,
                    filters: {
                        'Postman Files': ['json', 'postman']
                    },
                    title: 'Select Postman files'
                });
                if (uris && uris.length > 0) {
                    const plyOptions = new PlyConfig(workspaceFolder, this.log).plyOptions;
                    const importer = new ply.Import('postman', plyOptions.testsLocation, plyOptions.prettyIndent, this.log);
                    for (const uri of uris) {
                        this.log.info(`Importing postman file ${uri.fsPath}`);
                        importer.doImport(new ply.Retrieval(uri.fsPath));
                    }
                }
            }

        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    }

}
