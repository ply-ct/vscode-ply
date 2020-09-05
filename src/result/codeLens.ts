import * as vscode from 'vscode';

export class SegmentCodeLensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];

    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        this.codeLenses = [];
        if (document.uri.fragment) {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
            this.codeLenses.push(new vscode.CodeLens(range, {
                title: 'Compare result files',
                command: 'ply.openResult',
                arguments: [document.uri, true]
            }));
            this.codeLenses.push(new vscode.CodeLens(range, {
                title: 'Open result file',
                command: 'ply.openResult',
                arguments: [document.uri]
            }));
        }
        return this.codeLenses;
    }
}