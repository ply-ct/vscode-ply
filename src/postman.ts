import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { PlyConfig } from './config';

export class Postman {
    constructor(readonly log: ply.Log) { }

    async import(...args: any[]) {
        let workspaceFolder: vscode.WorkspaceFolder | undefined = undefined;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) {
            vscode.window.showErrorMessage('Ply needs your workspace to have a folder to import into.');
            return;
        }
        try {
            workspaceFolder = workspaceFolders[0];

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
                    const plyOptions = new PlyConfig(workspaceFolder).plyOptions;
                    const importer = new ply.Import('postman', plyOptions.testsLocation, plyOptions.prettyIndent, this.log);
                    for (const uri of uris) {
                        this.log.info(`Importing postman file ${uri.fsPath}`);
                        importer.doImport(new ply.Retrieval(uri.fsPath));
                    }
                }
            }

        } catch (err: unknown) {
            console.error(err);
            this.log.error(`${err}`);
            vscode.window.showErrorMessage(`${err}`);
        }
    }

}
