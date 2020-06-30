import * as vscode from 'vscode';

export class PlyResultContentProvider implements vscode.TextDocumentContentProvider {

    static scheme = 'ply.result-diff';

    constructor() {
    }

    dispose() {
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string | null> {
        const document = await vscode.workspace.openTextDocument(uri.with({ scheme: 'file', query: '' }));
        return document.getText();

    }
}