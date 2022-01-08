import * as os from 'os';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { Step, Disposable } from 'flowbee';
import { PlyConfig } from '../config';

export class RequestContentProvider implements vscode.TextDocumentContentProvider {
    private disposables: Disposable[] = [];
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    get onDidChange() {
        return this._onDidChange.event;
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const fileUri = uri.with({ scheme: 'file', fragment: '' });
        const text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(fileUri));
        if (uri.fragment) {
            const yamlObj = ply.loadYaml(fileUri.fsPath, text, true);
            if (uri.path.endsWith('.flow')) {
                let step: Step | undefined;
                if (uri.fragment.startsWith('f')) {
                    const dot = uri.fragment.indexOf('.');
                    const subflow = yamlObj.subflows.find(
                        (sf: any) => sf.id === uri.fragment.substring(0, dot)
                    );
                    if (subflow) {
                        step = subflow.steps.find(
                            (s: any) => s.id === uri.fragment.substring(dot + 1)
                        );
                    }
                } else {
                    step = yamlObj.steps.find((s: any) => s.id === uri.fragment);
                }
                if (!step) throw new Error(`Step not found: ${uri}`);
                return ply.dumpYaml(this.getRequest(step), this.getIndent(fileUri));
            } else {
                const reqObj = yamlObj[uri.fragment];
                if (!reqObj) throw new Error(`Request not found: ${uri}`);
                return ply.util
                    .lines(text)
                    .slice(reqObj.__start, reqObj.__end + 1)
                    .join(os.EOL);
            }
        } else {
            return text;
        }
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

    /**
     * TODO: better way to determine indent
     */
    getIndent(uri: vscode.Uri): number {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            return new PlyConfig(workspaceFolder).plyOptions.prettyIndent;
        } else {
            return 2;
        }
    }

    dispose() {
        this._onDidChange.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
