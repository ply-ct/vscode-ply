import * as vscode from 'vscode';
import { PlyRoots } from './plyRoots';

export class PlyCodeLensProvider implements vscode.CodeLensProvider {
    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly plyRoots: PlyRoots
    ) {}

    provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        if (
            document.uri.scheme === 'file' &&
            (document.uri.path.endsWith('.yaml') || document.uri.path.endsWith('.yml')) &&
            document.uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)
        ) {
            const suiteInfo = this.plyRoots.getSuiteInfo(PlyRoots.fromUri(document.uri));
            if (suiteInfo) {
                for (const child of suiteInfo.children) {
                    if (child.type === 'test' && typeof child.line === 'number') {
                        const range = new vscode.Range(
                            new vscode.Position(child.line, 0),
                            new vscode.Position(child.line, 0)
                        );
                        codeLenses.push(
                            new vscode.CodeLens(range, {
                                title: 'Request Editor',
                                command: 'ply.open-request',
                                arguments: [
                                    {
                                        id: child.id,
                                        uri: document.uri,
                                        workspaceFolder: this.workspaceFolder
                                    }
                                ]
                            })
                        );
                        codeLenses.push(
                            new vscode.CodeLens(range, {
                                title: 'Submit',
                                command: 'ply.submit',
                                arguments: [
                                    {
                                        id: child.id,
                                        uri: document.uri,
                                        workspaceFolder: this.workspaceFolder
                                    }
                                ]
                            })
                        );
                    }
                }
            }
            return codeLenses;
        }
    }
}
