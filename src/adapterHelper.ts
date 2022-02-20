import * as fs from 'fs';
import * as vscode from 'vscode';
import { RunOptions, loadYaml } from '@ply-ct/ply';
import { Descriptor } from 'flowbee';
import { PlyAdapter } from './adapter';
import { Request } from './request/request';
import { Result } from './result/result';
import { PlyConfig } from './config';

export class AdapterHelper {
    constructor(
        readonly type: 'requests' | 'cases' | 'flows',
        readonly adapters: Map<string, PlyAdapter>
    ) {}

    getAdapter(uri: vscode.Uri): PlyAdapter {
        // without try/catch, user sees the following with no info in console/log:
        // "Unable to open 'xxx.ply.yaml': Assertion Failed: argument is undefined or null."
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(
                uri.with({ scheme: 'file', fragment: '' })
            );
            if (!workspaceFolder) {
                throw new Error(`Workspace folder not found for flow path: ${uri}`);
            }
            const adapter = this.adapters.get(workspaceFolder.uri.toString());
            if (!adapter) {
                throw new Error(
                    `No test adapter found for workspace folder: ${workspaceFolder.uri}`
                );
            }
            return adapter;
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
            throw err;
        }
    }

    async run(
        uri: vscode.Uri,
        target?: string,
        values: object = {},
        runOptions?: RunOptions,
        debug = false,
        noAutoOpen = false
    ) {
        try {
            const fileUri = uri.with({ scheme: 'file', fragment: '' });
            let id: string;
            if (uri.scheme === 'ply-request') {
                id = uri.with({ scheme: 'file' }).toString(true);
            } else {
                id = this.getId(fileUri, target);
            }
            console.debug(`run: ${id}`);
            const adapter = this.getAdapter(fileUri);
            await adapter?.run([id], values, { ...runOptions, proceed: true, noAutoOpen });
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
        }
    }

    async expectedResult(uri: vscode.Uri, type: string, target?: string) {
        const id = this.getId(uri, target);
        console.debug(`expected: ${id}`);
        const adapter = this.getAdapter(uri);
        const suite = adapter?.plyRoots.getSuite(id);
        if (suite) {
            let fileUri = vscode.Uri.file(suite.runtime.results.expected.toString());
            if (target) {
                fileUri = fileUri.with({ fragment: target });
            }
            const expectedUri = Result.fromUri(fileUri)
                .toUri()
                .with({ query: `type=${type}` });
            if (fs.existsSync(expectedUri.fsPath)) {
                await vscode.commands.executeCommand('ply.openResult', expectedUri);
            } else {
                vscode.window.showErrorMessage(
                    `Expected results file not found: ${expectedUri.fsPath}`
                );
            }
        } else {
            vscode.window.showErrorMessage(`Suite not found for: ${id}`);
        }
    }

    async compareResults(uri: vscode.Uri, target?: string) {
        const id = this.getId(uri, target);
        console.debug(`compare: ${id}`);
        vscode.commands.executeCommand('ply.diff', id);
    }

    async removeActualResult(uri: vscode.Uri) {
        const id = this.getId(uri);
        const adapter = this.getAdapter(uri);
        const suite = adapter?.plyRoots.getSuite(id);
        if (suite) {
            const actual = suite.runtime.results.actual.toString();
            if (fs.existsSync(actual)) {
                fs.promises.unlink(actual);
            }
        }
    }

    getId(uri: vscode.Uri, target?: string): string {
        let id = uri.toString(true);
        if (target) {
            id += `#${target}`;
        } else {
            id = `${this.type}|${id}`;
        }
        return id;
    }

    async getRequestDescriptors(uri: vscode.Uri): Promise<(Descriptor & { request: Request })[]> {
        const ret: (Descriptor & { request: Request })[] = [];
        const adapter = this.getAdapter(uri);
        if (adapter) {
            const dotPlys = adapter.plyRoots.filter((info) => {
                // TODO better test than this?
                return (info.file && info.description?.endsWith('.ply')) || false;
            });
            for (const dotPly of dotPlys) {
                const uri = vscode.Uri.parse(dotPly.file!).with({ scheme: 'file' });
                const text = new TextDecoder('utf-8').decode(
                    await vscode.workspace.fs.readFile(uri.with({ fragment: undefined }))
                );
                const obj = text.startsWith('{') ? JSON.parse(text) : loadYaml(uri.fsPath, text);
                const name = Object.keys(obj)[0];
                const request = { ...obj[name], name };
                ret.push({
                    path: 'request',
                    type: 'step',
                    name: dotPly.label,
                    icon: 'request.svg',
                    link: {
                        label: dotPly.description!,
                        url: uri.with({ scheme: 'ply-request' }).toString()
                    },
                    request
                });
            }
        }
        return ret;
    }

    getConfig(uri: vscode.Uri): PlyConfig {
        return this.getAdapter(uri)?.config;
    }
}
