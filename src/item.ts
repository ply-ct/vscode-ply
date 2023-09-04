import * as process from 'process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { Fs } from './fs';
import { TestHub, testExplorerExtensionId, TestAdapter } from './test-adapter/api/index';
import { PlyRoots } from './ply-roots';
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
            this.command = vscode.commands.registerCommand(
                `ply.new.${type}`,
                async (...args: any[]) => {
                    this.newItem(type, args);
                }
            );
        } else {
            this.command = vscode.commands.registerCommand('ply.new', async (...args: any[]) => {
                const type = await vscode.window.showQuickPick(['request', 'case', 'flow'], {
                    canPickMany: false,
                    placeHolder: 'Ply test type'
                });
                if (type) {
                    this.newItem(type as ply.TestType, args);
                }
            });
        }
    }

    getFilters(type: ply.TestType): { [name: string]: string[] } | undefined {
        if (type === 'request') {
            return { 'Ply Request': ['ply', 'ply.yaml', 'ply.yml'] };
        } else if (type === 'case') {
            return { 'Ply Case': this.isWin ? ['ts'] : ['ply.ts'] };
        } else if (type === 'flow') {
            return { 'Ply Flow': this.isWin ? ['flow'] : ['ply.flow'] };
        }
    }

    private get isWin(): boolean {
        return process.platform.startsWith('win');
    }

    async newItem(type: ply.TestType, ...args: any[]) {
        let dir: vscode.Uri | undefined = undefined;
        if (args[0] && args[0][0] && args[0][0].info) {
            const id = args[0][0].info.id;
            dir = PlyRoots.toUri(id);
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders?.length) {
                const plyOptions = new PlyConfig(workspaceFolders[0]).plyOptions;
                dir = vscode.Uri.file(plyOptions.testsLocation);
            }
        }

        const p = `${dir?.fsPath}/Untitled`;
        console.log('P: ' + p);
        let loc;
        if (type === 'flow') {
            loc = vscode.Uri.file(`${p}.ply.flow`);
        } else if (type === 'case') {
            loc = vscode.Uri.file(`${p}.ply.ts`);
        } else {
            loc = vscode.Uri.file(this.isWin ? p : `${p}.ply`);
        }
        const uri = await vscode.window.showSaveDialog({
            defaultUri: loc,
            filters: this.getFilters(type)
        });
        if (uri) {
            const dir = path.dirname(uri.fsPath);
            if (!(await new Fs(dir).exists())) {
                vscode.window.showErrorMessage(`Folder does not exist: ${dir}`);
            } else {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir));
                if (workspaceFolder) {
                    const testsLoc = new PlyConfig(workspaceFolder).plyOptions.testsLocation;
                    const fileLoc = new ply.Location(uri.fsPath);
                    if (fileLoc.isChildOf(testsLoc)) {
                        await new Fs(uri.fsPath).writeFile(await this.defaultContents(type));
                        this.openItem(type, uri);
                    } else {
                        vscode.window.showErrorMessage(
                            `New ${type} should reside under ply.testsLocation: ${testsLoc}`
                        );
                        return;
                    }
                } else {
                    // add workspace folder

                    // create from template since adding workspace folder triggers adapter load (empty flow = no good)
                    await new Fs(uri.fsPath).writeFile(await this.defaultContents(type));

                    const pos = vscode.workspace.workspaceFolders
                        ? vscode.workspace.workspaceFolders.length
                        : 0;
                    if (pos === 0) {
                        // first ever folder added to workspace causes re-activation
                        this.context.workspaceState.update('ply.to.open', uri.toString());
                    } else {
                        // wait for adapter to finish loading
                        const testExplorerExtension =
                            vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
                        if (testExplorerExtension) {
                            testExplorerExtension.exports.registerTestController({
                                registerTestAdapter: (adapter: TestAdapter) => {
                                    if (
                                        adapter.workspaceFolder?.uri.toString() ===
                                        vscode.Uri.file(dir).toString()
                                    ) {
                                        // this folder's ply adapter
                                        const disposable = adapter.tests(async (testLoadEvent) => {
                                            if (testLoadEvent.type === 'finished') {
                                                if (testLoadEvent.suite?.label === 'Ply') {
                                                    await this.openItem(type, uri);
                                                    disposable.dispose();
                                                }
                                            }
                                        });
                                    }
                                },
                                unregisterTestAdapter: (_adapter: TestAdapter) => {}
                            });
                        }
                    }

                    if (
                        !vscode.workspace.updateWorkspaceFolders(pos, null, {
                            uri: vscode.Uri.file(dir)
                        })
                    ) {
                        vscode.window.showErrorMessage(`Failed add workspace folder: ${dir}`);
                    }
                }
            }
        }
    }

    async defaultContents(type: ply.TestType): Promise<string> {
        if (type === 'flow') {
            return await new Fs(
                path.join(this.context.extensionPath, 'media/templates/default.flow')
            ).readTextFile();
        } else {
            return '';
        }
    }

    async openItem(type: ply.TestType, uri: vscode.Uri) {
        if (type === 'request' && uri.fsPath.endsWith('.ply')) {
            await vscode.commands.executeCommand('ply.open-request', { uri });
        } else if (type === 'flow') {
            await vscode.commands.executeCommand('ply.open-flow', { uri });
        } else {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        }
    }

    /**
     * Returns a test/suite item if found.
     */
    static async getItem(...args: any[]): Promise<Item | undefined> {
        if (args.length === 1) {
            if (typeof args[0] === 'string') {
                const id = args[0];
                const uri = PlyRoots.toUri(id);
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (workspaceFolder) {
                    return { id: args[0], uri, workspaceFolder };
                }
            } else if (
                (args[0] as Item).id &&
                (args[0] as Item).uri &&
                (args[0] as Item).workspaceFolder
            ) {
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
                    'Ply Requests/Cases/Flows': ['ply', 'yaml', 'yml', 'ts', 'flow']
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
