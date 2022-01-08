import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import * as findUp from 'find-up';
import * as WebSocket from 'ws';
import * as flowbee from 'flowbee';
import { PLY_CONFIGS } from '@ply-ct/ply';
import { Setting } from '../config';
import { WebSocketSender } from '../websocket';
import { AdapterHelper } from '../adapterHelper';
import { Web } from './web';

export interface FlowItemSelectEvent {
    uri: vscode.Uri;
}
export interface FlowActionEvent {
    uri: vscode.Uri;
    action: string;
    options?: any;
}
export interface FlowModeChangeEvent {
    mode: flowbee.Mode;
}
export interface FlowConfiguratorOpen {}
interface InstanceSubscribed {
    instanceId: string;
}

export class FlowEditor implements vscode.CustomTextEditorProvider {
    private websocketPort: number;
    private websocketBound = false;
    private disposables: flowbee.Disposable[] = [];
    private subscribedEvent = new flowbee.TypedEvent<InstanceSubscribed>();

    constructor(
        private context: vscode.ExtensionContext,
        private adapterHelper: AdapterHelper,
        private onFlowItemSelect: (
            listener: flowbee.Listener<FlowItemSelectEvent>
        ) => flowbee.Disposable,
        private onFlowAction: (listener: flowbee.Listener<FlowActionEvent>) => flowbee.Disposable,
        private onFlowModeChange: (
            listener: flowbee.Listener<FlowModeChangeEvent>
        ) => flowbee.Disposable,
        private onFlowConfiguratorOpen: (
            listener: flowbee.Listener<FlowConfiguratorOpen>
        ) => flowbee.Disposable
    ) {
        this.websocketPort = vscode.workspace
            .getConfiguration('ply')
            .get(Setting.websocketPort, 9351);
        // clear obsolete stored values
        const storedVals = this.context.workspaceState.get('ply-user-values') || ({} as any);
        if (storedVals) {
            let update = false;
            for (const testPath of Object.keys(storedVals)) {
                let file = testPath;
                const hash = file.lastIndexOf('#');
                if (hash !== -1) {
                    file = testPath.substring(0, hash);
                } else if (file.endsWith('.values')) {
                    file = file.substring(0, file.length - 7);
                }
                if (!fs.existsSync(file)) {
                    delete storedVals[testPath];
                    update = true;
                }
            }
            if (update) {
                this.context.workspaceState.update('ply-user-values', storedVals);
            }
        }
    }

    private bindWebsocket() {
        if (this.websocketPort && !this.websocketBound) {
            // websocket server for FlowEvents
            const webSocketServer = new WebSocket.Server({ port: this.websocketPort });
            webSocketServer.on('connection', (webSocket) => {
                webSocket.on('message', (message) => {
                    const topic = JSON.parse('' + message).topic;
                    WebSocketSender.subscribe(topic, webSocket);
                    this.subscribedEvent.emit({ instanceId: topic.substring(13) });
                });
                webSocket.on('error', (error) => {
                    console.error(error);
                });
                webSocket.on('close', (code, reason) => {
                    console.debug(`Closing WebSocket due to ${code}: ${reason}`);
                    WebSocketSender.unsubscribe(webSocket);
                });
            });
            webSocketServer.on('error', async (error) => {
                console.error(error);
                this.websocketBound = false;
                if ((error as any).code === 'EADDRINUSE') {
                    // try auto-increment
                    const plyConfig = vscode.workspace.getConfiguration('ply');
                    const port = plyConfig.get(Setting.websocketPort, 9351) + 1;
                    await plyConfig.update(
                        Setting.websocketPort,
                        port,
                        vscode.ConfigurationTarget.Workspace
                    );
                } else {
                    vscode.window.showErrorMessage(`Flow editor websocket error: ${error.message}`);
                }
            });
            webSocketServer.on('close', () => {
                WebSocketSender.unsubscribe();
            });
            this.websocketBound = true;
        }
    }

    /**
     * This is called once when flow is opened (not called again on lose/regain focus).
     */
    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true
        };

        this.bindWebsocket();

        const mediaPath = path.join(this.context.extensionPath, 'media');
        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();

        const web = new Web(
            baseUri,
            path.join(mediaPath, 'flow.html'),
            webviewPanel.webview.cspSource
        );
        web.webSocketPort = this.websocketPort;

        webviewPanel.webview.html = web.html;

        const updateWebview = async (select?: string) => {
            const isFile = document.uri.scheme === 'file';
            const msg = {
                type: 'update',
                base: baseUri.toString(),
                file: isFile ? document.uri.fsPath : document.uri.toString(),
                text: document.getText(),
                config: { websocketPort: this.websocketPort },
                readonly: !isFile || (fs.statSync(document.uri.fsPath).mode & 146) === 0
            } as any;
            if (select) {
                msg.select = select;
            }
            await webviewPanel.webview.postMessage(msg);
        };

        this.disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === 'change') {
                    const isNew = !document.getText().trim();
                    if (isNew) {
                        // applyEdit does not update file -- why?
                        fs.writeFileSync(document.uri.fsPath, message.text);
                    } else {
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            document.uri,
                            new vscode.Range(0, 0, document.lineCount, 0),
                            message.text
                        );
                        await vscode.workspace.applyEdit(edit);
                    }
                    this.adapterHelper.removeActualResult(document.uri);
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
                        result: res === 'OK'
                    });
                } else if (message.type === 'run' || message.type === 'debug') {
                    const debug = message.type === 'debug';
                    this.adapterHelper.run(
                        document.uri,
                        message.target,
                        message.values,
                        message.options,
                        debug
                    );
                } else if (message.type === 'stop') {
                    this.adapterHelper.getAdapter(document.uri)?.cancel();
                    let instance;
                    try {
                        instance = this.getInstance(document.uri);
                    } finally {
                        webviewPanel.webview.postMessage({
                            type: 'instance',
                            instance,
                            event: 'stop'
                        });
                    }
                } else if (message.type === 'edit') {
                    if (message.element === 'request') {
                        let uri: vscode.Uri;
                        if (message.url) {
                            uri = vscode.Uri.parse(message.url);
                        } else {
                            uri = document.uri.with({
                                scheme: 'ply-request',
                                fragment: message.target
                            });
                        }
                        vscode.commands.executeCommand('ply.open-request', { uri });
                    }
                } else if (message.type === 'expected') {
                    this.adapterHelper.expectedResult(document.uri, message.target);
                } else if (message.type === 'compare') {
                    this.adapterHelper.compareResults(document.uri, message.target);
                } else if (message.type === 'instance') {
                    const instance = this.getInstance(document.uri);
                    webviewPanel.webview.postMessage({ type: 'instance', instance });
                    if (!instance) {
                        this.promptToRunForInstance(document.uri);
                    }
                } else if (message.type === 'configurator') {
                    await vscode.commands.executeCommand('workbench.action.closePanel');
                } else if (message.type === 'values') {
                    // store values
                    const storedVals =
                        this.context.workspaceState.get('ply-user-values') || ({} as any);
                    if (message.storeVals) {
                        storedVals[message.key] = message.storeVals;
                    } else {
                        delete storedVals[message.key];
                    }
                    this.context.workspaceState.update('ply-user-values', storedVals);
                } else if (message.type === 'valuesFiles') {
                    let configPath = findUp.sync(PLY_CONFIGS, {
                        cwd: path.dirname(document.fileName)
                    });

                    if (!configPath) {
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        if (!workspaceFolder) {
                            throw new Error(`No workspace folder: ${document.uri}`);
                        }
                        configPath = vscode.Uri.parse(
                            `${workspaceFolder.uri}/plyconfig.json`
                        ).fsPath;
                        fs.writeFileSync(
                            configPath,
                            `{${os.EOL}\t"valuesFiles": [${os.EOL}\t]${os.EOL}}`,
                            { encoding: 'utf-8' }
                        );
                    }

                    const configDoc = await vscode.workspace.openTextDocument(
                        vscode.Uri.file(configPath)
                    );
                    await vscode.window.showTextDocument(configDoc);
                    const lines = configDoc.getText().split(/\r?\n/);
                    const lineNumber = lines.findIndex(
                        (line) => line.indexOf('valuesFiles') !== -1
                    );
                    if (lineNumber >= 0) {
                        await vscode.commands.executeCommand('revealLine', {
                            lineNumber,
                            at: 'top'
                        });
                    } else {
                        const edit = new vscode.WorkspaceEdit();
                        const lastClosingBrace = lines.reduce((lcb, line, i) => {
                            if (line.trimEnd().endsWith('}')) {
                                return i;
                            } else {
                                return lcb;
                            }
                        }, -1);
                        if (lastClosingBrace !== -1) {
                            const insLine = lastClosingBrace > 0 ? lastClosingBrace - 1 : 0;
                            edit.insert(
                                configDoc.uri,
                                new vscode.Position(insLine, lines[insLine].length),
                                `,${os.EOL}\t"valuesFiles": [${os.EOL}\t]${os.EOL}`
                            );
                            await vscode.workspace.applyEdit(edit);

                            await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
                        }
                    }
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((configChange) => {
                if (configChange.affectsConfiguration('workbench.colorTheme')) {
                    webviewPanel.webview.postMessage({
                        type: 'theme-change'
                    });
                }
                if (configChange.affectsConfiguration('ply.websocketPort')) {
                    const newPort = vscode.workspace
                        .getConfiguration('ply')
                        .get(Setting.websocketPort, 9351);
                    if (newPort !== this.websocketPort) {
                        web.webSocketPort = newPort;
                        this.websocketPort = newPort;
                        this.websocketBound = false;
                        this.bindWebsocket();
                        webviewPanel.webview.html = web.html;
                        updateWebview();
                    }
                }
            })
        );

        if (document.uri.scheme === 'file') {
            const awaitInstanceSubscribe = async () => {
                const promise = new Promise<string>((resolve) => {
                    this.subscribedEvent.once((e) => {
                        resolve(e.instanceId);
                    });
                });
                return promise;
            };

            const flowPath = document.uri.fsPath.replace(/\\/g, '/');
            for (const adapter of this.adapterHelper.adapters.values()) {
                let flowInstanceId: string | null = null;
                const listener: flowbee.Listener<flowbee.FlowEvent> = async (
                    flowEvent: flowbee.FlowEvent
                ) => {
                    if (flowEvent.flowPath === flowPath) {
                        if (
                            flowEvent.elementType === 'flow' &&
                            (flowEvent.eventType === 'start' ||
                                flowEvent.eventType === 'finish' ||
                                flowEvent.eventType === 'error')
                        ) {
                            if (flowEvent.eventType === 'start') {
                                flowInstanceId = null;
                            }
                            // set the diagram instance so it'll start listening for websocket updates
                            webviewPanel.webview.postMessage({
                                type: 'instance',
                                instance: flowEvent.instance as flowbee.FlowInstance,
                                event: flowEvent.eventType
                            });
                        } else {
                            if (!flowInstanceId) {
                                // wait until diagram is subscribed before sending updates
                                flowInstanceId = await awaitInstanceSubscribe();
                            }
                            WebSocketSender.send(
                                `flowInstance-${flowEvent.flowInstanceId}`,
                                flowEvent
                            );
                        }
                    }
                };
                console.debug(`Adapter.onFlow() listener for: ${flowPath}`);
                this.disposables.push(adapter.onFlow(listener));
            }

            const onValuesUpdate = async (resultUri?: vscode.Uri) => {
                const adapter = this.adapterHelper.getAdapter(document.uri);
                if (adapter?.values) {
                    const suite = adapter.plyRoots.getSuite(this.adapterHelper.getId(document.uri));
                    if (suite) {
                        const actualPath = suite.runtime.results.actual.toString();
                        if (!resultUri || actualPath === resultUri.fsPath.replace(/\\/g, '/')) {
                            webviewPanel.webview.postMessage({
                                type: 'values',
                                base: baseUri.toString(),
                                flowPath: document.uri.fsPath,
                                values: await adapter.values.getResultValues(
                                    this.adapterHelper.getId(document.uri)
                                ),
                                storeVals: this.context.workspaceState.get('ply-user-values'),
                                files: adapter.values.files
                            });
                        }
                    }
                }
            };

            const adapter = this.adapterHelper.getAdapter(document.uri);
            this.disposables.push(
                adapter.onLoad(async (loaded) => {
                    const requests = loaded.success
                        ? await this.adapterHelper.getRequestDescriptors(document.uri)
                        : [];
                    webviewPanel.webview.postMessage({ type: 'requests', requests });
                })
            );

            if (adapter.values) {
                this.disposables.push(
                    adapter.values.onValuesUpdate((updateEvent) =>
                        onValuesUpdate(updateEvent.resultUri)
                    )
                );
                // initial values
                await webviewPanel.webview.postMessage({
                    type: 'values',
                    base: baseUri.toString(),
                    flowPath: document.uri.fsPath,
                    values: await adapter.values.getResultValues(
                        this.adapterHelper.getId(document.uri)
                    ),
                    storeVals: this.context.workspaceState.get('ply-user-values'),
                    files: adapter.values.files
                });
            } else {
                adapter.onceValues(async (e) => {
                    webviewPanel.webview.postMessage({
                        type: 'values',
                        base: baseUri.toString(),
                        flowPath: document.uri.fsPath,
                        values: await e.values.getResultValues(
                            this.adapterHelper.getId(document.uri)
                        ),
                        storeVals: this.context.workspaceState.get('ply-user-values'),
                        files: e.values.files
                    });
                    this.disposables.push(
                        e.values.onValuesUpdate((updateEvent) =>
                            onValuesUpdate(updateEvent.resultUri)
                        )
                    );
                });
            }

            this.disposables.push(
                this.onFlowAction(async (flowAction) => {
                    const flowUri = flowAction.uri.with({ fragment: '' });
                    if (flowUri.toString() === document.uri.toString()) {
                        webviewPanel.webview.postMessage({
                            type: 'action',
                            action: flowAction.action,
                            target: flowAction.uri.fragment,
                            options: flowAction.options
                        });
                    }
                })
            );
        }

        this.disposables.push(
            this.onFlowItemSelect((flowItemSelect) => {
                if (
                    flowItemSelect.uri.with({ fragment: '' }).toString() === document.uri.toString()
                ) {
                    updateWebview(flowItemSelect.uri.fragment);
                }
            })
        );

        this.disposables.push(
            this.onFlowModeChange(async (modeChange) => {
                if (modeChange.mode === 'runtime') {
                    const instance = this.getInstance(document.uri);
                    webviewPanel.webview.postMessage({ type: 'instance', instance });
                    if (!instance) {
                        this.promptToRunForInstance(document.uri);
                    }
                } else {
                    webviewPanel.webview.postMessage({ type: 'mode', mode: modeChange.mode });
                }
            })
        );

        this.disposables.push(
            this.onFlowConfiguratorOpen(() => {
                webviewPanel.webview.postMessage({ type: 'open-configurator' });
            })
        );

        webviewPanel.onDidDispose(() => {
            for (const disposable of this.disposables) {
                disposable.dispose();
            }
            this.disposables = [];
        });

        await updateWebview();
        const requests = await this.adapterHelper.getRequestDescriptors(document.uri);
        webviewPanel.webview.postMessage({ type: 'requests', requests });
    }

    /**
     * Instance from results
     */
    getInstance(uri: vscode.Uri): flowbee.FlowInstance | undefined {
        const adapter = this.adapterHelper.getAdapter(uri);
        const id = `flows|${uri.toString(true)}`;
        const suite = adapter.plyRoots.getSuite(id);
        if (suite) {
            return suite.runtime.results.flowInstanceFromActual(uri.fsPath);
        } else {
            throw new Error(`Flow not found: ${id}`);
        }
    }

    async promptToRunForInstance(uri: vscode.Uri) {
        const runFlow = 'Run flow to inspect results';
        const resumeEdit = 'Resume editing';
        const res = await vscode.window.showQuickPick([runFlow, resumeEdit], {
            placeHolder: 'No results to inspect'
        });
        if (res === runFlow) {
            this.adapterHelper.run(uri);
        }
    }
}
