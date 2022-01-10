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
     * Stats mod time should not reflect mods due to file doc saves.
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

        // let text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(fileUri));
        // if (uri.fragment) {
        //     // actually uri should always have fragment
        //     const yamlObj = ply.loadYaml(fileUri.fsPath, text, true);
        //     if (uri.path.endsWith('.flow')) {
        //         const step = RequestFs.getStep(uri, yamlObj);
        //         text = ply.dumpYaml(RequestFs.getRequest(step), RequestFs.getIndent(fileUri));
        //     } else {
        //         const reqObj = yamlObj[uri.fragment];
        //         if (!reqObj) throw new Error(`Request not found: ${uri}`);
        //         text = ply.util
        //             .lines(text)
        //             .slice(reqObj.__start, reqObj.__end + 1)
        //             .join(os.EOL);
        //     }
        // }
        // return new TextEncoder().encode(text);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const updated = Buffer.from(content).toString('utf8');
        if (uri.path.endsWith('.flow')) {
            // TODO
        } else {
            await new RequestMerge(this.toFileUri(uri)).writeRequest(uri, updated);
        }
        // const fileUri = this.toFileUri(uri);
        // let updated = Buffer.from(content).toString('utf8');

        // if (uri.fragment) {
        //     const fileText = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString(
        //         'utf8'
        //     );
        //     if (uri.path.endsWith('.flow')) {
        //         const yamlObj = ply.loadYaml(fileUri.toString(), fileText);
        //         const step = RequestFs.getStep(uri, yamlObj);
        //         const reqObj = ply.loadYaml(uri.toString(), updated);
        //         this.setRequest(step, reqObj);
        //         updated = ply.dumpYaml(yamlObj, RequestFs.getIndent(fileUri));
        //     } else {
        //         updated = updated.trimEnd();
        //         const yamlObj = ply.loadYaml(fileUri.toString(), fileText, true);
        //         const reqObj = yamlObj[uri.fragment];
        //         const lines = ply.util.lines(fileText);
        //         updated =
        //             lines.slice(0, reqObj.__start).join(os.EOL) +
        //             (reqObj.__start > 0 ? os.EOL : '') +
        //             updated +
        //             (reqObj.__end < lines.length - 1 ? os.EOL : '') +
        //             lines.slice(reqObj.__end + 1).join(os.EOL);
        //     }
        // }

        // await vscode.workspace.fs.writeFile(fileUri, Buffer.from(updated, 'utf8'));
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
