import * as vscode from 'vscode';

export class SegmentCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        if (document.uri.fragment) {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
            codeLenses.push(
                new vscode.CodeLens(range, {
                    title: 'Compare result files',
                    command: 'ply.openResult',
                    arguments: [document.uri, true]
                })
            );
            codeLenses.push(
                new vscode.CodeLens(range, {
                    title: 'Open result file',
                    command: 'ply.openResult',
                    arguments: [document.uri]
                })
            );
        }
        return codeLenses;
    }
}
