import * as vscode from 'vscode';
import { Result } from './result';

export class ResultContentProvider implements vscode.TextDocumentContentProvider {

    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange() { return this.onDidChangeEmitter.event; }

    /**
     * maps file uri string to ply-result uris
     */
    private resultUris = new Map<string,string[]>();
    private subscription = vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.uri.scheme === Result.URI_SCHEME) {
            const fileUri = Result.convertUri(doc.uri).toString();
            const plyUris = this.resultUris.get(fileUri);
            if (plyUris) {
                const plyUri = doc.uri.toString();
                const i = plyUris.indexOf(plyUri);
                if (i >= 0) {
                    plyUris.splice(i, 1);
                }
                if (plyUris.length === 0) {
                    this.resultUris.delete(fileUri);
                }
            }

        } else {
            this.resultUris.delete(doc.uri.toString());
        }
    });

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const fileUri = Result.convertUri(uri);
        const result = Result.fromUri(uri);
        if (await result.plyResult.exists) {
            // const fileUri = Result.convertUri(uri).toString();
            let plyUris = this.resultUris.get(fileUri.toString());
            if (!plyUris) {
                plyUris = [];
                this.resultUris.set(fileUri.toString(), plyUris);
            }
            const plyUri = uri.toString();
            if (!plyUris.includes(plyUri)) {
                plyUris.push(plyUri);
            }
            const resultContents = await result.getResultContents();
            return resultContents ? resultContents.contents : '';
        }
        else {
            return ''; // return empty string for purposes of comparison
        }
    }

    update(fileUri: vscode.Uri) {
        const plyUris = this.resultUris.get(fileUri.toString());
        if (plyUris) {
            for (const plyUri of plyUris) {
                this.onDidChangeEmitter.fire(vscode.Uri.parse(plyUri));
            }
        }
    }

    dispose() {
        this.resultUris.clear();
        this.subscription.dispose();
    }
}