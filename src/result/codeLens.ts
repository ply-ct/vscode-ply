import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { PlyRoots } from '../plyRoots';

export class SegmentCodeLensProvider implements vscode.CodeLensProvider {

    private codeLenses: vscode.CodeLens[] = [];

    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        this.codeLenses = [];
        if (document.uri.fragment) {
            const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
            this.codeLenses.push(new vscode.CodeLens(range, {
                title: 'Show in result file',
                command: 'ply.openResult',
                arguments: [document.uri]
            }));
        }
        return this.codeLenses;
    }
}