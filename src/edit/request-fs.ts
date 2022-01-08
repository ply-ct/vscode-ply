import * as os from 'os';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { Step } from 'flowbee';
import { PlyConfig } from '../config';

export class RequestFsProvider implements vscode.FileSystemProvider {
    static URI_SCHEME = 'ply-request';

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(_uri: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes
        return new vscode.Disposable(() => {});
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const fileUri = this.toFileUri(uri);
        return await vscode.workspace.fs.stat(fileUri);
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const fileUri = this.toFileUri(uri);
        let text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(fileUri));
        if (uri.fragment) {
            const yamlObj = ply.loadYaml(fileUri.fsPath, text, true);
            if (uri.path.endsWith('.flow')) {
                const step = this.getStep(uri, yamlObj);
                text = ply.dumpYaml(this.getRequest(step), this.getIndent(fileUri));
            } else {
                const reqObj = yamlObj[uri.fragment];
                if (!reqObj) throw new Error(`Request not found: ${uri}`);
                text = ply.util
                    .lines(text)
                    .slice(reqObj.__start, reqObj.__end + 1)
                    .join(os.EOL);
            }
        }
        return new TextEncoder().encode(text);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const fileUri = this.toFileUri(uri);
        const fileText = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');

        let updated = Buffer.from(content).toString('utf8');

        if (uri.fragment) {
            if (uri.path.endsWith('.flow')) {
                const yamlObj = ply.loadYaml(fileUri.toString(), fileText);
                const step = this.getStep(uri, yamlObj);
                const reqObj = ply.loadYaml(uri.toString(), updated);
                this.setRequest(step, reqObj);
                updated = ply.dumpYaml(yamlObj, this.getIndent(fileUri));
            } else {
                updated = updated.trimEnd();
                const yamlObj = ply.loadYaml(fileUri.toString(), fileText, true);
                const reqObj = yamlObj[uri.fragment];
                const lines = ply.util.lines(fileText);
                updated =
                    lines.slice(0, reqObj.__start).join(os.EOL) +
                    (reqObj.__start > 0 ? os.EOL : '') +
                    updated +
                    (reqObj.__end < lines.length - 1 ? os.EOL : '') +
                    lines.slice(reqObj.__end + 1).join(os.EOL);
            }
        }

        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(updated, 'utf8'));
    }

    /**
     * Get step from flow request uri
     */
    private getStep(uri: vscode.Uri, yamlObj: any): Step {
        let step: Step | undefined;
        if (uri.fragment.startsWith('f')) {
            const dot = uri.fragment.indexOf('.');
            const subflow = yamlObj.subflows.find(
                (sf: any) => sf.id === uri.fragment.substring(0, dot)
            );
            if (subflow) {
                step = subflow.steps.find((s: any) => s.id === uri.fragment.substring(dot + 1));
            }
        } else {
            step = yamlObj.steps.find((s: any) => s.id === uri.fragment);
        }
        if (!step) throw new Error(`Step not found: ${uri}`);
        return step;
    }

    getRequest(step: Step): object {
        const name = step.name.replace(/\r/g, '').replace(/\n/g, '_');
        const reqObj: any = {
            [name]: {
                url: step.attributes?.url,
                method: step.attributes?.method,
                headers: {}
            }
        };
        if (step.attributes?.headers) {
            for (const row of JSON.parse(step.attributes.headers)) {
                reqObj[name].headers[row[0]] = row[1];
            }
        }
        if (step.attributes?.body) reqObj[name].body = step.attributes.body;
        return reqObj;
    }

    setRequest(step: Step, reqObj: object) {
        const oldName = Object.keys(reqObj)[0];
        step.name = oldName.replace(/_/g, os.EOL);
        if (!step.attributes) step.attributes = {};
        const req = (reqObj as any)[oldName];
        step.attributes.url = req.url;
        step.attributes.method = req.method;
        if (req.headers) {
            const rows: string[][] = [];
            for (const key of Object.keys(req.headers)) {
                rows.push([key, '' + req.headers[key]]);
            }
            step.attributes.headers = JSON.stringify(rows);
        }
        if (req.body) step.attributes.body = req.body;
    }

    private toFileUri(requestUri: vscode.Uri) {
        return requestUri.with({ scheme: 'file', fragment: '', query: '' });
    }

    /**
     * TODO: better way to determine indent
     */
    private getIndent(uri: vscode.Uri): number {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            return new PlyConfig(workspaceFolder).plyOptions.prettyIndent;
        } else {
            return 2;
        }
    }

    private _bufferedEvents: vscode.FileChangeEvent[] = [];
    private _fireSoonHandle?: NodeJS.Timer;

    dispose() {}

    createDirectory() {}
    readDirectory() {
        return [];
    }
    delete() {}
    rename() {}
}
