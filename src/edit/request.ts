import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Listener, Disposable } from 'flowbee';
import { AdapterHelper } from '../adapterHelper';
import { Web } from './web';
import { Response, Flow, Location, util } from '@ply-ct/ply';
import { Marker, Problems } from './problems';
import { RequestMerge } from '../request/request';
import { FlowMerge } from '../request/flow';
import { TestResult } from '../result/result';
import { filtersFromContentType } from '../util/files';
import { ValuesUpdateEvent } from '../values/values';

export interface RequestActionEvent {
    uri: vscode.Uri;
    action: string;
}

export interface RequestEditorOptions {
    base: string;
    indent?: number;
    lineNumbers?: boolean;
    folding?: boolean;
    hovers?: boolean;
    readonly: boolean;
    runnable: boolean;
    dummyUrl: string;
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
                    this.openFileDocs.set(doc.uri.toString(), doc);
                }
            })
        );
        this.subscriptions.push(
            vscode.workspace.onDidCloseTextDocument((doc) => {
                if (doc.uri.scheme === 'file') {
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

        const updateRequest = async (options?: RequestEditorOptions) => {
            const isFile = document.uri.scheme === 'file';
            const msg = {
                type: 'update',
                options: {
                    base: baseUri.toString(),
                    indent: adapter.config.plyOptions.prettyIndent,
                    readonly: false,
                    runnable: true
                },
                file: isFile ? document.uri.fsPath : document.uri.toString(),
                text: document.getText(),
                sent: this.time()
            } as any;
            if (options) msg.options = options;
            await webviewPanel.webview.postMessage(msg);
        };

        let requestCanceled = false;
        const updateResponse = (response?: Response & { source: string }) => {
            webviewPanel.webview.postMessage({
                type: 'response',
                response: requestCanceled ? undefined : response,
                sent: this.time(),
                ...(requestCanceled && { requestCanceled })
            });
        };
        const updateResult = (result: TestResult) => {
            webviewPanel.webview.postMessage({
                type: 'result',
                result,
                sent: this.time()
            });
        };

        const updateValues = async (resultUri?: vscode.Uri) => {
            const adapter = this.adapterHelper.getAdapter(document.uri);
            if (adapter?.values) {
                // update suite response
                const suite = adapter.plyRoots.getSuite(this.adapterHelper.getId(document.uri));
                if (suite) {
                    const actualPath = suite.runtime.results.actual.toString();
                    if (!resultUri || actualPath === resultUri.fsPath.replace(/\\/g, '/')) {
                        const response = this.getResponse(document.uri);
                        if (response) updateResponse(response);
                    }
                }
                // post new values
                const suiteId = this.adapterHelper.getSuiteId(document.uri);
                webviewPanel.webview.postMessage({
                    type: 'values',
                    holders: await adapter.values.getValuesHolders(suiteId),
                    options: adapter.values.getEvalOptions()
                });
            }
        };

        let disposables: { dispose(): void }[] = [];
        const problems = new Map<string, Problems>();
        disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === 'ready') {
                    await updateRequest(
                        this.getOptions(document.uri, {
                            base: baseUri.toString(),
                            indent: adapter.config.plyOptions.prettyIndent,
                            readonly: false,
                            runnable: true,
                            dummyUrl: 'https://ply-ct.org/movies'
                        })
                    );
                    updateResponse(this.getResponse(document.uri));
                    updateValues();
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
                } else if (message.type === 'open-file') {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.file));
                } else if (message.type === 'action') {
                    if (message.action === 'run' || message.action === 'submit') {
                        requestCanceled = false;
                        if (document.isDirty) {
                            requestCanceled = !(await this.promptOrSave(document.uri));
                            if (!requestCanceled) {
                                await document.save();
                            }
                        }
                        if (requestCanceled) {
                            updateResponse(undefined);
                        } else {
                            if (
                                document.uri.scheme === 'file' &&
                                document.uri.fsPath.endsWith('.ply')
                            ) {
                                // double-check within ply testsLoc
                                const testsLoc = adapter.config.plyOptions.testsLocation;
                                if (!new Location(document.uri.fsPath).isChildOf(testsLoc)) {
                                    updateResult({
                                        state: 'errored',
                                        message: `Request file: ${document.uri.fsPath} must be under Ply testsLocation: ${testsLoc}`
                                    });
                                    return;
                                }
                            }

                            const runOptions =
                                message.action === 'submit'
                                    ? { submit: true, responseBodySortedKeys: false }
                                    : undefined;
                            this.adapterHelper.run(
                                document.uri,
                                message.target,
                                {},
                                runOptions,
                                false,
                                true
                            );
                        }
                    } else if (message.action === 'save') {
                        const resp = this.getResponse(document.uri);
                        if (resp?.body) {
                            let body = resp.body;
                            if (util.isBinary(resp.headers, adapter.config.plyOptions)) {
                                body = util.base64ToUintArray(body);
                            }
                            const saveOptions: vscode.SaveDialogOptions = {
                                filters: filtersFromContentType(resp.headers['content-type'])
                            };
                            const workspaceFolderUri = vscode.workspace.getWorkspaceFolder(
                                document.uri
                            )?.uri;
                            if (workspaceFolderUri) {
                                saveOptions.defaultUri = workspaceFolderUri.with({
                                    path: `${workspaceFolderUri.path}/${message.target}`
                                });
                            }
                            const fileUri = await vscode.window.showSaveDialog(saveOptions);
                            if (fileUri) {
                                await fs.promises.writeFile(fileUri.fsPath, body);
                                await vscode.commands.executeCommand('vscode.open', fileUri);
                            }
                        }
                    } else if (message.action === 'cancel') {
                        requestCanceled = true;
                        // no can turn back request
                    } else if (message.action === 'open-file') {
                        vscode.commands.executeCommand(
                            'vscode.open',
                            document.uri.with({ scheme: 'file', fragment: '' })
                        );
                    } else if (message.action === 'expected') {
                        let type = 'request';
                        let target = message.target;
                        if (document.uri.path.endsWith('.flow') && document.uri.fragment) {
                            type = 'flow';
                            target = document.uri.fragment;
                        }
                        this.adapterHelper.expectedResult(
                            document.uri.with({ scheme: 'file', fragment: '' }),
                            type,
                            target
                        );
                    } else if (message.action === 'compare') {
                        let target = message.target;
                        if (document.uri.path.endsWith('.flow') && document.uri.fragment) {
                            target = document.uri.fragment;
                        }
                        this.adapterHelper.compareResults(
                            document.uri.with({ scheme: 'file', fragment: '' }),
                            target
                        );
                    }
                }
            })
        );

        if (document.uri.scheme === 'ply-request') {
            // listen for external changes to embedded requests
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

            // whole file opened, need to sync
            disposables.push(
                vscode.workspace.onDidOpenTextDocument((fileDoc) => {
                    const fileUri = document.uri.with({ scheme: 'file', fragment: '' });
                    if (fileDoc.uri.toString() === fileUri.toString() && document.isDirty) {
                        this.updateFileDoc(document.uri, fileDoc, document.getText());
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
            disposables.push(
                adapter.testStates((testRunEvent) => {
                    const fileUri = document.uri.with({ scheme: 'file' });
                    if (
                        testRunEvent.type === 'test' &&
                        testRunEvent.state !== 'running' &&
                        (document.uri.path.endsWith('.ply') ||
                            fileUri.toString(true) === testRunEvent.test)
                    ) {
                        updateResult({
                            state: testRunEvent.state,
                            message: testRunEvent.message
                        });
                    } else if (testRunEvent.type === 'finished') {
                        updateResponse(this.getResponse(document.uri));
                    }
                })
            );

            if (adapter.values) {
                updateValues();
                disposables.push(
                    adapter.values.onValuesUpdate((updateEvent: ValuesUpdateEvent) =>
                        updateValues(updateEvent.resultUri)
                    )
                );
            } else {
                adapter.onceValues(async (e) => {
                    updateValues();
                    disposables.push(
                        e.values.onValuesUpdate((updateEvent: ValuesUpdateEvent) =>
                            updateValues(updateEvent.resultUri)
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

        this.subscriptions.push(
            webviewPanel.onDidDispose(() => {
                for (const disposable of disposables) {
                    disposable.dispose();
                }
                disposables = [];
                for (const probs of problems.values()) {
                    probs.clear();
                }
                problems.clear();
            })
        );
    }

    /**
     * Response from actual results
     */
    getResponse(uri: vscode.Uri): (Response & { source: string }) | undefined {
        const adapter = this.adapterHelper.getAdapter(uri);
        const suiteId = this.adapterHelper.getSuiteId(uri);
        const suite = adapter.plyRoots.getSuite(suiteId);
        if (suite) {
            if (uri.fragment && uri.query.startsWith('runNumber=')) {
                const runNumber = parseInt(uri.query.substring(10));
                let name = suite.name;
                // TODO why here does suite name end with .flow?
                if (name.endsWith('.flow')) name = name.substring(0, name.length - 5);
                const run = suite.runtime.results.runs.readRun(name, runNumber, uri.fragment);
                if (run?.response) {
                    // TODO source
                    return { ...run.response, source: JSON.stringify(run.response, null, 2) };
                }
            } else if (suite.runtime.results.actual.exists) {
                const responses = suite.runtime.results.responsesFromActual();
                if (uri.fragment) {
                    if (suite.type === 'flow') {
                        // TODO subflow step
                        const plyFlow = (suite as any).plyFlow as Flow;
                        const step = plyFlow.flow.steps?.find((s) => s.id === uri.fragment);
                        if (step) {
                            const name = step.name.replace(/\r?\n/g, ' ');
                            let response = responses[name];
                            // find latest if looping
                            for (const key of Object.keys(responses)) {
                                if (
                                    key.startsWith(`${name}_`) &&
                                    !isNaN(Number(key.substring(name.length + 1)))
                                ) {
                                    response = responses[key];
                                }
                            }
                            return response;
                        }
                    } else {
                        return responses[uri.fragment];
                    }
                } else {
                    return responses[Object.keys(responses)[0]];
                }
            }
        }
    }

    private async update(document: vscode.TextDocument, text: string, alsoFile = false) {
        const isNew = !document.getText().trim();
        if (isNew) {
            fs.writeFileSync(document.uri.fsPath, text);
        } else {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
            await vscode.workspace.applyEdit(edit);
            if (document.uri.scheme === 'ply-request' && alsoFile) {
                const fileUri = document.uri.with({ scheme: 'file', fragment: '', query: '' });
                const openFileDoc = this.openFileDocs.get(fileUri.toString());
                if (openFileDoc && !openFileDoc.isClosed) {
                    this.updateFileDoc(document.uri, openFileDoc, text);
                }
            }
        }
    }

    private async updateFileDoc(
        requestUri: vscode.Uri,
        fileDoc: vscode.TextDocument,
        text: string
    ) {
        const fileUri = fileDoc.uri;
        const edit = new vscode.WorkspaceEdit();
        // update file doc
        if (fileUri.path.endsWith('.flow')) {
            const updated = await new FlowMerge(fileUri).updateRequest(requestUri, text);
            edit.replace(fileDoc.uri, new vscode.Range(0, 0, fileDoc.lineCount, 0), updated);
        } else {
            const range = new RequestMerge(fileUri).getRange(requestUri, fileDoc);
            edit.replace(fileDoc.uri, range, text);
        }
        await vscode.workspace.applyEdit(edit);
    }

    getOptions(uri: vscode.Uri, baseOptions: RequestEditorOptions): RequestEditorOptions {
        const editorSettings = vscode.workspace.getConfiguration('editor', uri);
        return {
            ...baseOptions,
            lineNumbers: editorSettings.get('lineNumbers', 'on') === 'on',
            hovers: editorSettings.get('hover.enabled', true),
            folding: editorSettings.get('folding', true),
            readonly: uri.scheme === 'git' || (fs.statSync(uri.fsPath).mode & 146) === 0,
            runnable: uri.scheme !== 'git'
        };
    }

    /**
     * Returns false if canceled.
     */
    async promptOrSave(uri: vscode.Uri): Promise<boolean> {
        const adapter = this.adapterHelper.getAdapter(uri);
        if (adapter) {
            let doSave = adapter.config.saveBeforeRun;
            if (!doSave) {
                const saveAndRun = 'Save and Run';
                const alwaysSave = 'Always Save before Run';
                const docName = path.basename(uri.path);
                const res = await vscode.window.showWarningMessage(
                    `Save request before running: ${docName}?`,
                    saveAndRun,
                    alwaysSave,
                    'Cancel'
                );
                doSave = res === saveAndRun || res === alwaysSave;
                if (res === alwaysSave) {
                    vscode.workspace
                        .getConfiguration('ply')
                        .update('saveBeforeRun', true, vscode.ConfigurationTarget.Workspace);
                }
            }
            return doSave;
        } else {
            return false;
        }
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
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
        this.subscriptions = [];
        this.openFileDocs.clear();
    }
}
