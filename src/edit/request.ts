import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Listener, Disposable } from 'flowbee';
import { AdapterHelper } from '../adapterHelper';
import { Web } from './web';
import { Response, Flow } from '@ply-ct/ply';
import { Marker, Problems } from './problems';
import { RequestMerge } from '../request/request';
import { FlowMerge } from '../request/flow';

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
    // subscriptions are long-running disposables (not disposed with webview)
    private subscriptions: { dispose(): void }[] = [];

    private openFileDocs = new Map<string, vscode.TextDocument>();

    constructor(
        private context: vscode.ExtensionContext,
        private adapterHelper: AdapterHelper,
        private onRequestAction: (listener: Listener<RequestActionEvent>) => Disposable
    ) {
        this.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((doc) => {
                if (doc.uri.scheme === 'file') {
                    console.debug(`Open doc: ${doc.uri}`);
                    this.openFileDocs.set(doc.uri.toString(), doc);
                }
            })
        );
        this.subscriptions.push(
            vscode.workspace.onDidCloseTextDocument((doc) => {
                if (doc.uri.scheme === 'file') {
                    console.debug(`Close doc: ${doc.uri}`);
                    this.openFileDocs.delete(doc.uri.toString());
                }
            })
        );
    }

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
            await webviewPanel.webview.postMessage(msg);
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

        let disposables: { dispose(): void }[] = [];
        const problems = new Map<string, Problems>();
        disposables.push(
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
                    await this.update(document, message.text, true);
                    this.adapterHelper.removeActualResult(document.uri);
                } else if (message.type === 'markers' && Array.isArray(message.markers)) {
                    this.showProblems(problems, document.uri, message.resource, message.markers);
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

        // listen for external changes to embedded requests
        if (document.uri.scheme === 'ply-request') {
            disposables.push(
                vscode.workspace.onDidChangeTextDocument(async (docChange) => {
                    const uri = docChange.document.uri;
                    const fileUri = document.uri.with({ scheme: 'file', fragment: '' });
                    if (uri.toString() === fileUri.toString()) {
                        // corresponding file was changed externally (eg: flow editor)
                        if (document.uri.path.endsWith('.flow')) {
                            const text = new FlowMerge(fileUri).getRequestText(
                                document.uri,
                                docChange.document
                            );
                            if (text !== document.getText()) {
                                await this.update(document, text);
                                await updateRequest();
                            }
                        } else {
                            const text = docChange.document.getText(
                                new RequestMerge(fileUri).getRange(document.uri, docChange.document)
                            );
                            if (text !== document.getText()) {
                                await this.update(document, text);
                                await updateRequest(); // reflect doc changes
                            }
                        }
                    }
                })
            );
        }

        disposables.push(
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

            disposables.push(
                adapter.testStates((testRunEvent) => {
                    if (testRunEvent.type === 'test' && testRunEvent.state === 'errored') {
                        webviewPanel.webview.postMessage({
                            type: 'error',
                            text: testRunEvent.message,
                            sent: this.time()
                        });
                    } else if (testRunEvent.type === 'finished') {
                        updateResponse(this.getResponse(document.uri));
                    }
                })
            );

            if (adapter.values) {
                disposables.push(
                    adapter.values.onValuesUpdate((updateEvent) =>
                        updateResults(updateEvent.resultUri)
                    )
                );
            } else {
                adapter.onceValues(async (e) => {
                    // TODO: Need to send message (or is this just an edge case during extension development)?
                    disposables.push(
                        e.values.onValuesUpdate((updateEvent) =>
                            updateResults(updateEvent.resultUri)
                        )
                    );
                });
            }

            disposables.push(
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
            for (const disposable of disposables) {
                disposable.dispose();
            }
            disposables = [];
            for (const probs of problems.values()) {
                probs.clear();
            }
            problems.clear();
        });
    }

    /**
     * Response from actual results
     */
    getResponse(uri: vscode.Uri): (Response & { source: string }) | undefined {
        const adapter = this.adapterHelper.getAdapter(uri);
        let suiteUri = uri;
        if (uri.scheme === 'ply-request') {
            suiteUri = uri.with({ scheme: 'file', fragment: '' });
        }
        const suiteId =
            (uri.path.endsWith('.flow') ? 'flows|' : 'requests|') + suiteUri.toString(true);
        const suite = adapter.plyRoots.getSuite(suiteId);
        if (suite && suite.runtime.results.actual.exists) {
            const responses = suite.runtime.results.responsesFromActual();
            if (uri.fragment) {
                if (suite.type === 'flow') {
                    // TODO subflow step
                    const plyFlow = (suite as any).plyFlow as Flow;
                    const step = plyFlow.flow.steps?.find((s) => s.id === uri.fragment);
                    if (step) return responses[step.name.replace(/\r?\n/g, ' ')];
                } else {
                    return responses[uri.fragment];
                }
            } else {
                return responses[Object.keys(responses)[0]];
            }
        }
    }

    async update(document: vscode.TextDocument, text: string, alsoFile = false) {
        const isNew = !document.getText().trim();
        if (isNew) {
            fs.writeFileSync(document.uri.fsPath, text);
        } else {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
            if (document.uri.scheme === 'ply-request' && alsoFile) {
                const fileUri = document.uri.with({ scheme: 'file', fragment: '', query: '' });
                const openFileDoc = this.openFileDocs.get(fileUri.toString());
                if (openFileDoc && !openFileDoc.isClosed) {
                    // update file doc
                    if (fileUri.path.endsWith('.flow')) {
                        const updated = await new FlowMerge(fileUri).updateRequest(
                            document.uri,
                            text
                        );
                        edit.replace(
                            openFileDoc.uri,
                            new vscode.Range(0, 0, openFileDoc.lineCount, 0),
                            updated
                        );
                    } else {
                        const range = new RequestMerge(fileUri).getRange(document.uri, openFileDoc);
                        edit.replace(openFileDoc.uri, range, text);
                    }
                }
            }
            await vscode.workspace.applyEdit(edit);
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

    showProblems(
        problems: Map<string, Problems>,
        uri: vscode.Uri,
        resource: string,
        markers: Marker[]
    ) {
        const id = uri.toString();
        let probs = problems.get(id);
        if (!probs) {
            probs = new Problems(uri);
            problems.set(id, probs);
        }
        probs.show(resource, markers);
    }

    time(): string {
        const date = new Date();
        const hrs = String(date.getHours()).padStart(2, '0');
        const mins = String(date.getMinutes()).padStart(2, '0');
        const secs = String(date.getSeconds()).padStart(2, '0');
        const millis = String(date.getMilliseconds()).padStart(3, '0');
        return `${hrs} ${mins} ${secs} ${millis}`;
    }

    dispose() {
        console.log('***** DISPOSING REQUEST EDITOR *****');
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions = [];

        this.openFileDocs.clear();
    }
}
