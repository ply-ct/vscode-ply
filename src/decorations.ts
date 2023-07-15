import { promises as fs, existsSync } from 'fs';
import * as vscode from 'vscode';
import * as jsYaml from 'js-yaml';
import { PlyRequest, Flow, Step } from '@ply-ct/ply-api';

export class PlyExplorerDecorationProvider implements vscode.FileDecorationProvider {
    async provideFileDecoration(
        uri: vscode.Uri,
        _token: vscode.CancellationToken
    ): Promise<vscode.FileDecoration | null> {
        if (uri.scheme === 'ply-explorer' && uri.fragment) {
            if (uri.path.endsWith('.ply')) {
                const file = this.fileFromUri(uri);
                if (existsSync(file)) {
                    try {
                        const yaml = await fs.readFile(file, { encoding: 'utf-8' });
                        const plyObj = jsYaml.load(yaml, { filename: file }) as {
                            [key: string]: PlyRequest;
                        };
                        const id = this.idFromFragment(uri.fragment);
                        return this.getFileDecoration(plyObj[id]?.method);
                    } catch (err: unknown) {
                        console.error(err);
                    }
                }
            } else if (uri.path.endsWith('.yaml') || uri.path.endsWith('.yml')) {
                const file = this.fileFromUri(uri);
                if (existsSync(file)) {
                    try {
                        const yaml = await fs.readFile(file, { encoding: 'utf-8' });
                        const yamlObj = jsYaml.load(yaml, {
                            filename: `${file}#${uri.fragment}`
                        }) as {
                            [key: string]: PlyRequest;
                        };
                        const id = this.idFromFragment(uri.fragment);
                        return this.getFileDecoration(yamlObj[id]?.method);
                    } catch (err: unknown) {
                        console.error(err);
                    }
                }
            } else if (uri.path.endsWith('.flow')) {
                const file = this.fileFromUri(uri);
                if (existsSync(file)) {
                    try {
                        const yaml = await fs.readFile(file, { encoding: 'utf-8' });
                        const flow = jsYaml.load(yaml, {
                            filename: `${file}#${uri.fragment}`
                        }) as Flow;
                        const id = this.idFromFragment(uri.fragment);
                        const dot = id.indexOf('.');
                        let step: Step | undefined;
                        if (dot > 0 && id.length > dot + 1) {
                            const subflow = flow.subflows?.find(
                                (sf) => sf.id === id.substring(0, dot)
                            );
                            if (subflow) {
                                step = subflow.steps?.find((s) => s.id === id.substring(dot + 1));
                            }
                        } else {
                            step = flow.steps?.find((s) => s.id === id);
                        }
                        if (step?.path === 'request') {
                            return this.getFileDecoration(step.attributes?.method);
                        }
                    } catch (err: unknown) {
                        console.error(err);
                    }
                }
            }
        }
        return null;
    }

    /**
     * Ply explorer uri to file path
     */
    private fileFromUri(uri: vscode.Uri): string {
        if (uri.scheme === 'ply-explorer' && uri.path.startsWith('file://')) {
            let file = uri.path.substring(7);
            if (process.platform.startsWith('win') && file.startsWith('/')) {
                file = file.substring(1);
            }
            return file;
        }
        return uri.fsPath;
    }

    /**
     * TODO: why ends with _1
     */
    private idFromFragment(fragment: string): string {
        if (fragment.length > 2 && fragment.charAt(fragment.length - 2) === '_') {
            return fragment.substring(0, fragment.length - 2);
        }
        return fragment;
    }

    getFileDecoration(method?: string): vscode.FileDecoration | null {
        if (method === 'GET') {
            return {
                badge: 'G',
                tooltip: 'GET'
            };
        } else if (method === 'POST') {
            return {
                badge: 'Po',
                tooltip: 'POST'
            };
        } else if (method === 'PUT') {
            return {
                badge: 'Pu',
                tooltip: 'PUT'
            };
        } else if (method === 'PATCH') {
            return {
                badge: 'Pa',
                tooltip: 'PATCH'
            };
        } else if (method === 'DELETE') {
            return {
                badge: 'D',
                tooltip: 'DELETE'
            };
        }
        return null;
    }
}
