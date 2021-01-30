import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { TestHub, testExplorerExtensionId, TestAdapter } from 'vscode-test-adapter-api';
import { PlyRoots } from './plyRoots';
import { PlyConfig } from './config';

interface Item {
    id: string;
    uri: vscode.Uri;
    workspaceFolder: vscode.WorkspaceFolder;
}

export class PlyItem {

    command: { dispose(): any };

    constructor(private context: vscode.ExtensionContext, type?: ply.TestType) {
        if (type) {
            this.command = vscode.commands.registerCommand(`ply.new.${type}`, async (...args: any[]) => {
                this.newItem(type, args);
            });
        } else {
            this.command = vscode.commands.registerCommand('ply.new', async (...args: any[]) => {
                const type = await vscode.window.showQuickPick(
                    ['request', 'case', 'flow'],
                    { canPickMany: false, placeHolder: 'Ply test type' }
                );
                if (type) {
                    this.newItem(type as ply.TestType, args);
                }
            });
        }
    }

    getFilters(type: ply.TestType): { [name: string]: string[] } | undefined {
        if (type === 'request') {
            return { 'Ply Request': ['ply.yaml', 'ply.yml'] };
        } else if (type === 'case') {
            return { 'Ply Case': ['ply.ts'] };
        } else if (type === 'flow') {
            return { 'Ply Flow': ['flow'] };
        }
    }

    async newItem(type: ply.TestType, ...args: any[]) {
        let dir: vscode.Uri | undefined = undefined;
        if (args[0] && args[0][0] && args[0][0].info) {
            const id = args[0][0].info.id;
            dir = PlyRoots.toUri(id);
        }
        const uri = await vscode.window.showSaveDialog({
            defaultUri: dir,
            filters: this.getFilters(type)
        });
        if (uri) {
            const dir = path.dirname(uri.fsPath);
            if (!fs.existsSync(dir)) {
                vscode.window.showErrorMessage(`Folder does not exist: ${dir}`);
            } else {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir));
                if (workspaceFolder) {
                    const testsLoc = new PlyConfig(workspaceFolder).plyOptions.testsLocation;
                    const fileLoc = new ply.Location(uri.fsPath);
                    if (fileLoc.isChildOf(testsLoc)) {
                        await fs.promises.writeFile(uri.fsPath, await this.defaultContents(type), 'utf8');
                        this.openItem(type, uri);
                    } else {
                        vscode.window.showErrorMessage(`New ${type} should reside under ply.testsLocation: ${testsLoc}`);
                        return;
                    }
                } else { // add workspace folder

                    // create from template since adding workspace folder triggers adapter load (empty flow = no good)
                    await fs.promises.writeFile(uri.fsPath, await this.defaultContents(type), 'utf8');

                    const pos = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0;
                    if (pos === 0) {
                        // first ever folder added to workspace causes re-activation
                        this.context.workspaceState.update('ply.to.open', uri.toString());
                    } else {
                        // wait for adapter to finish loading
                        const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
                        if (testExplorerExtension) {
                            testExplorerExtension.exports.registerTestController({
                                registerTestAdapter: (adapter: TestAdapter) => {
                                    if (adapter.workspaceFolder?.uri.toString() === vscode.Uri.file(dir).toString()) {
                                        // this folder's ply adapter
                                        const disposable = adapter.tests(async testLoadEvent => {
                                            if (testLoadEvent.type === 'finished') {
                                                if (testLoadEvent.suite?.label === 'Ply') {
                                                    await this.openItem(type, uri);
                                                    disposable.dispose();
                                                }
                                            }
                                        });
                                    }
                                },
                                unregisterTestAdapter: (_adapter: TestAdapter) => { }
                            });
                        }
                    }

                    if (!vscode.workspace.updateWorkspaceFolders(pos, null, { uri: vscode.Uri.file(dir) })) {
                        vscode.window.showErrorMessage(`Failed add workspace folder: ${dir}`);
                    }
                }
            }
        }
    }

    async defaultContents(type: ply.TestType): Promise<string> {
        if (type === 'flow') {
            return await fs.promises.readFile(path.join(this.context.extensionPath, 'media/templates/default.flow'), 'utf-8');
        } else {
            return '';
        }
    }

    async openItem(type: ply.TestType, uri: vscode.Uri) {
        if (type === 'flow') {
            await vscode.commands.executeCommand('ply.open-flow', { uri });
        } else {
            const doc = await vscode.workspace.openTextDocument(uri);
            vscode.window.showTextDocument(doc);
        }
    }

    /**
     * Returns a test/suite item if found.
     */
    static async getItem(...args: any[]): Promise<Item | undefined > {
        if (args.length === 1) {
            if (typeof args[0] === 'string') {
                const id = args[0];
                const uri = PlyRoots.toUri(id);
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (workspaceFolder) {
                    return { id: args[0], uri, workspaceFolder };
                }
            } else if (args[0] as Item) {
                return args[0];
            }
        }

        let uri: vscode.Uri | undefined = undefined;
        let id: string | undefined = undefined;
        if (args.length > 0) {
            const node = args[0];
            if (node.adapterIds && node.adapterIds.length > 0) {
                id = node.adapterIds[0];
                if (id) {
                    uri = PlyRoots.toUri(id);
                }
            }
        } else {
            const uris = await vscode.window.showOpenDialog({
                openLabel: 'Select',
                canSelectMany: false,
                filters: {
                    'Ply Requests/Cases/Flows': ['yaml', 'yml', 'ts', 'flow']
                },
                title: 'Select Ply suite'
            });
            if (uris && uris.length > 0) {
                uri = uris[0];
                id = PlyRoots.fromUri(uri);
            }
        }
        if (id && uri) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                throw new Error(`No workspace folder found for URI: ${uri}`);
            }
            return { id, uri, workspaceFolder };
        }
    }
}

