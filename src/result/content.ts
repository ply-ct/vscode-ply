import * as vscode from 'vscode';
import { Result } from './result';

export class ResultContentProvider implements vscode.TextDocumentContentProvider {

    constructor() {

    }

    dispose() {
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const result = Result.fromUri(uri);
        if (await result.plyResult.exists) {
            const resultContents = await result.getResultContents();
            return resultContents ? resultContents.contents : '';
        }
        else {
            return ''; // return empty string for purposes of comparison
        }
    }
}