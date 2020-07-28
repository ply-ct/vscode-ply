import * as vscode from 'vscode';

export class ResultCodeLensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];

    constructor() {
        let enabled = vscode.workspace.getConfiguration("diffEditor.codeLens");
        console.log("ENABLED: ", enabled);
    }

    onDidChangeCodeLenses?: vscode.Event<void> | undefined;

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        this.codeLenses = [];

        return this.codeLenses;
    }
}