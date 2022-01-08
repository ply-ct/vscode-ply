import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Listener, Disposable } from 'flowbee';
import { AdapterHelper } from '../adapterHelper';
import { Web } from './web';
import { Response } from '@ply-ct/ply';
import { Marker, Problems } from './problems';

export interface RequestActionEvent {
    uri: vscode.Uri;
    action: string;
}

export interface RequestEditorOptions {
    base: string;
    indent?: number;
    lineNumbers?: boolean;
    hovers?: boolean;
}

export class RequestEditor implements vscode.CustomTextEditorProvider {
    private disposables: { dispose(): void }[] = [];
    private problems = new Map<string, Problems>();

    constructor(
        private context: vscode.ExtensionContext,
        private adapterHelper: AdapterHelper,
        private onRequestAction: (listener: Listener<RequestActionEvent>) => Disposable
    ) {}

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true
        };

        const webPath = path.join(this.context.extensionPath, 'web');
        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(webPath)).toString();

        const adapter = this.adapterHelper.getAdapter(document.uri);

        const web = new Web(
            baseUri,
            path.join(webPath, 'request.html'),
            webviewPanel.webview.cspSource
        );
        webviewPanel.webview.html = web.html;

        let requestCanceled = false;

        const updateRequest = async (options?: RequestEditorOptions) => {
            const isFile = document.uri.scheme === 'file';
            const msg = {
                type: 'update',
                options: {
                    base: baseUri.toString(),
                    indent: adapter.config.plyOptions.prettyIndent
                },
                file: isFile ? document.uri.fsPath : document.uri.toString(),
                text: document.getText(),
                readonly: !isFile || (fs.statSync(document.uri.fsPath).mode & 146) === 0,
                sent: this.time()
            } as any;
            if (options) msg.options = options;
            webviewPanel.webview.postMessage(msg);
        };

        const updateResponse = async (response?: Response & { source: string }) => {
            if (!requestCanceled) {
                webviewPanel.webview.postMessage({
                    type: 'response',
                    response: response,
                    sent: this.time()
                });
            }
            requestCanceled = false;
        };

        this.disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === 'ready') {
                    await updateRequest(
                        this.getOptions(document.uri, {
                            base: baseUri.toString(),
                            indent: adapter.config.plyOptions.prettyIndent
                        })
                    );
                    updateResponse(this.getResponse(document.uri));
                } else if (message.type === 'alert' || message.type === 'confirm') {
                    const options: vscode.MessageOptions = {};
                    const items: string[] = [];
                    if (message.type === 'confirm') {
                        options.modal = true;
                        items.push('OK');
                    }
                    let res;
                    if (message.message.level === 'info') {
                        res = await vscode.window.showInformationMessage(
                            message.message.text,
                            options,
                            ...items
                        );
                    } else if (message.message.level === 'warning') {
                        res = await vscode.window.showWarningMessage(
                            message.message.text,
                            options,
                            ...items
                        );
                    } else {
                        res = await vscode.window.showErrorMessage(
                            message.message.text,
                            options,
                            ...items
                        );
                    }
                    webviewPanel.webview.postMessage({
                        type: 'confirm',
                        id: message.message.id,
                        result: res === 'OK',
                        sent: this.time()
                    });
                } else if (message.type === 'change') {
                    await this.update(document, message.text);
                    this.adapterHelper.removeActualResult(document.uri);
                } else if (message.type === 'markers' && Array.isArray(message.markers)) {
                    this.showProblems(document.uri, message.resource, message.markers);
                } else if (message.type === 'action') {
                    if (message.action === 'run' || message.action === 'submit') {
                        if (document.isDirty) {
                            await document.save();
                        }
                        const runOptions =
                            message.action === 'submit' ? { submit: true } : undefined;
                        this.adapterHelper.run(
                            document.uri,
                            message.target,
                            {},
                            runOptions,
                            false,
                            true
                        );
                    } else if (message.action === 'cancel') {
                        // no can turn back request
                        requestCanceled = true;
                    }
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((configChange) => {
                if (configChange.affectsConfiguration('workbench.colorTheme')) {
                    webviewPanel.webview.postMessage({
                        type: 'theme-change',
                        sent: this.time()
                    });
                }
            })
        );

        if (document.uri.scheme === 'file' || document.uri.scheme === 'ply-request') {
            const updateResults = (resultUri?: vscode.Uri) => {
                const adapter = this.adapterHelper.getAdapter(document.uri);
                if (adapter?.values) {
                    const suite = adapter.plyRoots.getSuite(this.adapterHelper.getId(document.uri));
                    if (suite) {
                        const actualPath = suite.runtime.results.actual.toString();
                        if (!resultUri || actualPath === resultUri.fsPath.replace(/\\/g, '/')) {
                            const response = this.getResponse(document.uri);
                            if (response) updateResponse(response);
                        }
                    }
                }
            };

            this.disposables.push(
                adapter.testStates((testRunEvent) => {
                    if (testRunEvent.type === 'test' && testRunEvent.state === 'errored') {
                        webviewPanel.webview.postMessage({
                            type: 'error',
                            text: testRunEvent.message,
                            sent: this.time()
                        });
                    }
                })
            );

            if (adapter.values) {
                this.disposables.push(
                    adapter.values.onValuesUpdate((updateEvent) =>
                        updateResults(updateEvent.resultUri)
                    )
                );
            } else {
                adapter.onceValues(async (e) => {
                    // TODO: Need to send message (or is this just an edge case during extension development)?
                    this.disposables.push(
                        e.values.onValuesUpdate((updateEvent) =>
                            updateResults(updateEvent.resultUri)
                        )
                    );
                });
            }

            this.disposables.push(
                this.onRequestAction(async (requestAction) => {
                    if (requestAction.uri.toString() === document.uri.toString()) {
                        webviewPanel.webview.postMessage({
                            type: 'action',
                            action: requestAction.action,
                            sent: this.time()
                        });
                    }
                })
            );
        }

        webviewPanel.onDidDispose(() => {
            for (const disposable of this.disposables) {
                disposable.dispose();
            }
            this.disposables = [];
            for (const problems of this.problems.values()) {
                problems.clear();
            }
            this.problems.clear();
        });
    }

    async update(document: vscode.TextDocument, text: string) {
        const isNew = !document.getText().trim();
        if (isNew) {
            fs.writeFileSync(document.uri.fsPath, text);
        } else {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
            await vscode.workspace.applyEdit(edit);
        }
    }

    /**
     * Response from actual results
     */
    getResponse(uri: vscode.Uri): (Response & { source: string }) | undefined {
        const adapter = this.adapterHelper.getAdapter(uri);
        const id = `requests|${uri.toString(true)}`;
        const suite = adapter.plyRoots.getSuite(id);
        if (suite && suite.runtime.results.actual.exists) {
            const responses = suite.runtime.results.responsesFromActual();
            // TODO: use uri.fragment to support opening from multiple requests file
            return responses[Object.keys(responses)[0]];
        }
    }

    getOptions(uri: vscode.Uri, baseOptions: RequestEditorOptions): RequestEditorOptions {
        const editorSettings = vscode.workspace.getConfiguration('editor', uri);
        return {
            ...baseOptions,
            lineNumbers: editorSettings.get('lineNumbers', 'on') === 'on',
            hovers: editorSettings.get('hover.enabled', true)
        };
    }

    showProblems(uri: vscode.Uri, resource: string, markers: Marker[]) {
        const id = uri.toString();
        let problems = this.problems.get(id);
        if (!problems) {
            problems = new Problems(uri);
            this.problems.set(id, problems);
        }
        problems.show(resource, markers);
    }

    time(): string {
        const date = new Date();
        const hrs = String(date.getHours()).padStart(2, '0');
        const mins = String(date.getMinutes()).padStart(2, '0');
        const secs = String(date.getSeconds()).padStart(2, '0');
        const millis = String(date.getMilliseconds()).padStart(3, '0');
        return `${hrs} ${mins} ${secs} ${millis}`;
    }
}