import * as fs from 'fs';
import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { PlyRoots } from './plyRoots';

interface Item {
    id: string;
    uri: vscode.Uri;
    workspaceFolder: vscode.WorkspaceFolder;
}

export class PlyItem {

    command: { dispose(): any };

    constructor(type?: ply.TestType) {
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
            return { 'Ply Request': ['yaml', 'yml'] };
        } else if (type === 'case') {
            return { 'Ply Case': ['ts'] };
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
            if (fs.existsSync(uri.fsPath)) {
                vscode.window.showErrorMessage(`File already exists: ${uri.fsPath}`);
            }
            fs.writeFileSync(uri.fsPath, '', 'utf8');
            if (type === 'flow') {
                vscode.commands.executeCommand('ply.open-flow', { uri });
            } else {
                const doc = await vscode.workspace.openTextDocument(uri);
                vscode.window.showTextDocument(doc);
            }
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

