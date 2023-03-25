import * as vscode from 'vscode';
import { Result } from './result';

export class ResultFragmentFs implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(_uri: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes
        return new vscode.Disposable(() => {});
    }

    private stats = new Map<string, vscode.FileStat>();
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
        const result = Result.fromUri(uri);
        if (await result.plyResult.exists) {
            const resultContents = await result.readResultContents();
            if (resultContents) return resultContents.contents;
        }
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        Result.fromUri(uri).updateResultContents(
            Result.convertUri(uri),
            Buffer.from(content).toString('utf-8')
        );
    }

    dispose() {}

    createDirectory() {}
    readDirectory() {
        return [];
    }
    delete() {}
    rename() {}
}
