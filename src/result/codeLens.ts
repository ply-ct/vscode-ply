import * as vscode from 'vscode';

export class ResultCodeLensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];

    onDidChangeCodeLenses?: vscode.Event<void> | undefined;

    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        this.codeLenses = [];
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        this.codeLenses.push(new vscode.CodeLens(range,
            {
                title: 'Show in result file',
                command: 'ply.openResult',
                arguments: [document.uri]
            }
        ));

        return this.codeLenses;
    }
}