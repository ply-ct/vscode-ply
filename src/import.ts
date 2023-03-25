import * as path from 'path';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { PlyConfig } from './config';
import { ImportOptions } from '@ply-ct/ply';

export class Importer {
    constructor(readonly log: ply.Log) {}

    async import(format: 'postman' | 'insomnia', ...args: any[]) {
        let workspaceFolder: vscode.WorkspaceFolder | undefined = undefined;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) {
            vscode.window.showErrorMessage(
                'Ply needs your workspace to have a folder to import into.'
            );
            return;
        }
        try {
            workspaceFolder = workspaceFolders[0];

            if (args && args.length > 0 && args[0].adapterIds && args[0].adapterIds.length > 0) {
                const id = args[0].adapterIds[0];
                if (id.startsWith('Ply:')) {
                    workspaceFolder = vscode.workspace.getWorkspaceFolder(
                        vscode.Uri.parse(id.substring(4))
                    );
                }
            }

            if (!workspaceFolder) {
                workspaceFolder = await vscode.window.showWorkspaceFolderPick({
                    placeHolder: 'Select destination workspace folder',
                    ignoreFocusOut: true
                });
            }

            if (workspaceFolder) {
                const name = format === 'insomnia' ? 'Insomnia' : 'Postman';

                const items: vscode.QuickPickItem[] = [];
                const individualRequestsItem = {
                    label: 'Into Individual request file(s)',
                    description: '.ply'
                };
                items.push(individualRequestsItem);
                const requestSuiteItem = {
                    label: 'Into Ply request suite(s)',
                    description: '.yaml'
                };
                items.push(requestSuiteItem);
                const options = {
                    placeHolder: `Import ${name}:`,
                    canPickMany: false,
                    ignoreFocusOut: true
                };
                const res = await vscode.window.showQuickPick(items, options);

                if (!res) return;

                const uris = await vscode.window.showOpenDialog({
                    openLabel: 'Import',
                    canSelectMany: true,
                    filters:
                        format === 'insomnia'
                            ? { 'Insomnia Files': ['yaml', 'yml', 'json', 'insomnia'] }
                            : { 'Postman Files': ['json', 'postman'] },
                    title: `Select ${name} files`
                });
                if (uris && uris.length > 0) {
                    const plyOptions = new PlyConfig(workspaceFolder).plyOptions;
                    const importer = new ply.Import(format, this.log);
                    let valuesLoc = `${plyOptions.testsLocation}/values`;
                    if (plyOptions.valuesFiles) {
                        const firstEnabledValFile = Object.keys(plyOptions.valuesFiles).find(
                            (vf) => {
                                return plyOptions.valuesFiles[vf];
                            }
                        );
                        if (firstEnabledValFile) {
                            valuesLoc = valuesLoc = path.dirname(firstEnabledValFile);
                        }
                    }
                    const importOptions: ImportOptions = {
                        testsLocation: plyOptions.testsLocation,
                        valuesLocation: valuesLoc,
                        indent: plyOptions.prettyIndent,
                        importToSuite: res === requestSuiteItem
                    };
                    for (const uri of uris) {
                        this.log.info(`Importing ${format} file ${uri.fsPath}`);
                        importer.doImport(new ply.Retrieval(uri.fsPath), importOptions);
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
