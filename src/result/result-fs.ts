import * as vscode from 'vscode';
import { Result } from './result';

export class ResultFragmentFsProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(_uri: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes
        return new vscode.Disposable(() => {});
    }

    /**
     * maps file uri string to ply-result uris
     */
    private resultUris = new Map<string, string[]>();
    private subscription = vscode.workspace.onDidCloseTextDocument((doc) => {
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

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const fileUri = Result.convertUri(uri);
        const stat = await vscode.workspace.fs.stat(fileUri);
        if (uri.fragment && !(await this.readResult(uri))) {
            stat.permissions = vscode.FilePermission.Readonly;
        }
        return stat;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const result = (await this.readResult(uri)) || '';
        return new TextEncoder().encode(result);
    }

    private async readResult(uri: vscode.Uri): Promise<string | undefined> {
        const fileUri = Result.convertUri(uri);
        const result = Result.fromUri(uri);
        if (await result.plyResult.exists) {
            let plyUris = this.resultUris.get(fileUri.toString());
            if (!plyUris) {
                plyUris = [];
                this.resultUris.set(fileUri.toString(), plyUris);
            }
            const plyUri = uri.toString();
            if (!plyUris.includes(plyUri)) {
                plyUris.push(plyUri);
            }
            const resultContents = await result.readResultContents();
            if (resultContents) return resultContents.contents;
        }
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        Result.fromUri(uri).updateResultContents(
            Result.convertUri(uri),
            Buffer.from(content).toString('utf8')
        );
    }

    dispose() {
        this.resultUris.clear();
        this.subscription.dispose();
    }

    createDirectory() {}
    readDirectory() {
        return [];
    }
    delete() {}
    rename() {}
}
