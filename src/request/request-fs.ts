import * as vscode from 'vscode';
import { RequestMerge } from './request';
import { FlowMerge } from './flow';

export class RequestFs implements vscode.FileSystemProvider {
    static URI_SCHEME = 'ply-request';

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(_uri: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes
        return new vscode.Disposable(() => {});
    }

    /**
     * Stats mod time should not reflect mods due to dueling file doc saves.
     */
    private stats = new Map<string, vscode.FileStat>();
    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        let stat = this.stats.get(uri.toString());
        if (!stat) {
            const fileUri = this.toFileUri(uri);
            stat = await vscode.workspace.fs.stat(fileUri);
            this.stats.set(uri.toString(), stat);
        }
        return stat;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const fileUri = this.toFileUri(uri);
        if (uri.path.endsWith('.flow')) {
            return new TextEncoder().encode(await new FlowMerge(fileUri).readRequest(uri));
        } else {
            return new TextEncoder().encode(await new RequestMerge(fileUri).readRequest(uri));
        }
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const updated = Buffer.from(content).toString('utf8');
        if (uri.path.endsWith('.flow')) {
            await new FlowMerge(this.toFileUri(uri)).writeRequest(uri, updated);
        } else {
            await new RequestMerge(this.toFileUri(uri)).writeRequest(uri, updated);
        }
    }

    private toFileUri(requestUri: vscode.Uri) {
        return requestUri.with({ scheme: 'file', fragment: '', query: '' });
    }

    dispose() {
        this.stats.clear();
    }

    createDirectory() {}
    readDirectory() {
        return [];
    }
    delete() {}
    rename() {}
}
