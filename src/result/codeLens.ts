import * as vscode from 'vscode';

export class ResultCodeLensProvider implements vscode.CodeLensProvider {

    // private regex: RegExp = /(.+)/;
    private codeLenses: vscode.CodeLens[] = [];

    onDidChangeCodeLenses?: vscode.Event<void> | undefined;

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        this.codeLenses = [];
        this.codeLenses.push(new vscode.CodeLens(
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
            {
                title: 'Open file',
                command: 'ply.openResult',
                arguments: [document.uri]
            }
        ));

        return this.codeLenses;
    }
}