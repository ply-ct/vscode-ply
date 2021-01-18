import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as flowbee from 'flowbee';
import { RunOptions } from 'ply-ct';
import { PlyAdapter } from '../adapter';
import { Setting } from '../config';
import { WebSocketSender } from '../websocket';
import { Result } from '../result/result';

interface InstanceSubscribed { instanceId: string; }
export interface FlowItemSelectEvent { uri: vscode.Uri; }

export class FlowEditor implements vscode.CustomTextEditorProvider {

    private static html: string;
    private websocketPort: number;
    private websocketBound = false;
    private disposables: flowbee.Disposable[] = [];
    private subscribedEvent = new flowbee.TypedEvent<InstanceSubscribed>();

    constructor(
        readonly context: vscode.ExtensionContext,
        readonly adapters: Map<string,PlyAdapter>,
        readonly onFlowItemSelect: (listener: flowbee.Listener<FlowItemSelectEvent>) => flowbee.Disposable
    ) {
        this.websocketPort = vscode.workspace.getConfiguration('ply').get(Setting.websocketPort, 9371);
    }

    private bindWebsocket() {
        if (this.websocketPort && !this.websocketBound) {
            // websocket server for FlowEvents
            const webSocketServer = new WebSocket.Server({ port: this.websocketPort });
            webSocketServer.on('connection', webSocket => {
                webSocket.on('message', message => {
                    const topic = JSON.parse('' + message).topic;
                    WebSocketSender.subscribe(topic, webSocket);
                    this.subscribedEvent.emit({ instanceId: topic.substring(13) });
                });
                webSocket.on('error', error => {
                    console.error(error);
                });
                webSocket.on('close', (code, reason) => {
                    console.debug(`Closing WebSocket due to ${code}: ${reason}`);
                    WebSocketSender.unsubscribe(webSocket);
                });
            });
            webSocketServer.on('error', async error => {
                console.error(error);
                this.websocketBound = false;
                if ((error as any).code === 'EADDRINUSE') {
                    const modSettings = 'Modify in Settings';
                    const res = await vscode.window.showErrorMessage(
                        `Flow editor websocket port ${this.websocketPort} is already in use.`,
                        modSettings,
                        'Cancel'
                    );
                    if (res === modSettings) {
                        await vscode.commands.executeCommand('workbench.action.openSettings', 'ply.websocketPort');
                    }
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

        FlowEditor.html = '';
        // TODO cache this
        if (!FlowEditor.html) {
            FlowEditor.html = fs.readFileSync(path.join(mediaPath, 'flow.html'), 'utf-8');

            FlowEditor.html = FlowEditor.html.replace(/\${wsSource}/g, `ws://localhost:${this.websocketPort}`);

            // img
            const img  = vscode.Uri.file(path.join(mediaPath, 'icons'));
            const imgBase = webviewPanel.webview.asWebviewUri(img).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${imgBase}/g, imgBase);

            // css
            const flowCss = vscode.Uri.file(path.join(mediaPath, 'css', 'flow.css'));
            const flowCssUri = webviewPanel.webview.asWebviewUri(flowCss).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${flowCssUri}/g, flowCssUri);
            const flowbeeCss = vscode.Uri.file(path.join(mediaPath, 'css', 'flowbee.css'));
            const flowbeeCssUri = webviewPanel.webview.asWebviewUri(flowbeeCss).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${flowbeeCssUri}/g, flowbeeCssUri);

            // javascript
            const js = vscode.Uri.file(path.join(mediaPath, 'out', 'bundle.js'));
            const jsUri = webviewPanel.webview.asWebviewUri(js).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${jsUri}/g, jsUri);
        }

        // substitute the nonce and websocket port every time
        let html = FlowEditor.html.replace(/\${cspSource}/g, webviewPanel.webview.cspSource);
        html = html.replace(/\${nonce}/g, this.getNonce());
        webviewPanel.webview.html = html;

        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath));
        const updateWebview = async (instance?: flowbee.FlowInstance, select?: string) => {
            const msg = {
                type: 'update',
                base: baseUri.toString(),
                websocketPort: this.websocketPort,
                file: document.uri.fsPath,
                text: document.getText(),
                readonly: (fs.statSync(document.uri.fsPath).mode & 146) === 0
            } as any;
            if (instance) {
                msg.instance = instance;
            }
            if (select) {
                msg.select = select;
            }
            webviewPanel.webview.postMessage(msg);
        };

        this.disposables.push(webviewPanel.webview.onDidReceiveMessage(async message => {
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
            } else if (message.type === 'alert' || message.type === 'confirm') {
                const options: vscode.MessageOptions = {};
                const items: string[] = [];
                if (message.type === 'confirm') {
                    options.modal = true;
                    items.push('OK');
                }
                let res;
                if (message.message.level === 'info') {
                    res = await vscode.window.showInformationMessage(message.message.text, options, ...items);
                } else if (message.message.level === 'warning') {
                    res = await vscode.window.showWarningMessage(message.message.text, options, ...items);
                } else {
                    res = await vscode.window.showErrorMessage(message.message.text, options, ...items);
                }
                webviewPanel.webview.postMessage({
                    type: 'confirm',
                    id: message.message.id,
                    result: res === 'OK'
                });
            } else if (message.type === 'run' || message.type === 'debug') {
                const debug = message.type === 'debug';
                this.run(document.uri, message.target, message.values, message.options, debug);
            } else if (message.type === 'expected') {
                this.expectedResults(document.uri, message.target);
            } else if (message.type === 'compare') {
                this.compareResults(document.uri, message.target);
            } else if (message.type === 'instance') {
                updateWebview(this.getInstance(document.uri));
            }
        }));


        this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {
            if (configChange.affectsConfiguration('workbench.colorTheme')) {
                webviewPanel.webview.postMessage({
                    type: 'theme-change'
                });
            }
            if (configChange.affectsConfiguration('ply.websocketPort')) {
                const newPort = vscode.workspace.getConfiguration('ply').get(Setting.websocketPort, 9371);
                if (newPort !== this.websocketPort) {
                    html = html.replace(`ws://localhost:${this.websocketPort}`, `ws://localhost:${newPort}`);
                    this.websocketPort = newPort;
                    this.websocketBound = false;
                    this.bindWebsocket();
                    webviewPanel.webview.html = html;
                    updateWebview();
                }
            }
        }));

        const awaitInstanceSubscribe = async () => {
            const promise = new Promise<string>(resolve => {
                this.subscribedEvent.once(e =>  {
                    resolve(e.instanceId);
                });
            });
            return promise;
        };

        const flowPath = document.uri.fsPath.replace(/\\/g, '/');
        for (const adapter of this.adapters.values()) {
            let flowInstanceId: string | null = null;
            const listener: flowbee.Listener<flowbee.FlowEvent> = async (flowEvent: flowbee.FlowEvent) => {
                if (flowEvent.flowPath === flowPath) {
                    if (flowEvent.eventType === 'start' && flowEvent.elementType === 'flow') {
                        flowInstanceId = null;
                        // set the diagram instance so it'll start listening for websocket updates
                        updateWebview(flowEvent.instance as flowbee.FlowInstance);
                    } else {
                        if (!flowInstanceId) {
                            // wait until diagram is subscribed before sending updates
                            flowInstanceId = await awaitInstanceSubscribe();
                        }
                        WebSocketSender.send(`flowInstance-${flowEvent.flowInstanceId}`, flowEvent);
                    }
                }
            };
            console.debug(`Adapter.onFlow() listener for: ${flowPath}`);
            this.disposables.push(adapter.onFlow(listener));
        }

        this.disposables.push(this.onFlowItemSelect(flowItemSelect => {
            if (flowItemSelect.uri.with({fragment: ''}).toString() === document.uri.toString()) {
                updateWebview(undefined, flowItemSelect.uri.fragment);
            }
        }));

        const onValuesUpdate = async (resultUri: vscode.Uri) => {
            const adapter = this.getAdapter(document.uri);
            if (adapter?.values) {
                if (resultUri) {
                    const suite = adapter.plyRoots.getSuite(this.getId(document.uri));
                    if (suite) {
                        if (suite.runtime.results.actual.toString() === resultUri.fsPath) {
                            webviewPanel.webview.postMessage({
                                type: 'values',
                                base: baseUri.toString(),
                                values: await adapter.values.getResultValues(this.getId(document.uri))
                            });
                        }
                    }
                }
            }
        };

        const adapter = this.getAdapter(document.uri);
        if (adapter.values) {
            this.disposables.push(adapter.values.onValuesUpdate(updateEvent => onValuesUpdate(updateEvent.resultUri)));
        } else {
            adapter.onceValues(async e => {
                webviewPanel.webview.postMessage({
                    type: 'values',
                    base: baseUri.toString(),
                    values: await e.values.getResultValues(this.getId(document.uri))
                });
                this.disposables.push(e.values.onValuesUpdate(updateEvent => onValuesUpdate(updateEvent.resultUri)));
            });
        }

        webviewPanel.onDidDispose(() => {
            for (const disposable of this.disposables) {
                disposable.dispose();
            }
            this.disposables = [];
        });

        updateWebview();
    }

    updateWebviewValues() {

    }

    getNonce(): string {
        let nonce = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            nonce += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return nonce;
    }

    getAdapter(uri: vscode.Uri): PlyAdapter {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            throw new Error(`Workspace folder not found for flow path: ${uri}`);
        }
        const adapter = this.adapters.get(workspaceFolder.uri.toString());
        if (!adapter) {
            throw new Error(`No test adapter found for workspace folder: ${workspaceFolder.uri}`);
        }
        return adapter;
    }

    async run(uri: vscode.Uri, target?: string, values: object = {}, runOptions?: RunOptions, debug = false) {
        try {
            const id = this.getId(uri, target);
            console.debug(`run: ${id}`);
            const adapter = this.getAdapter(uri);
            await adapter?.run([id], values, runOptions);
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    }

    expectedResults(uri: vscode.Uri, target?: string) {
        const id = this.getId(uri, target);
        console.debug(`expected: ${id}`);
        const adapter = this.getAdapter(uri);
        const suite = adapter.plyRoots.getSuite(id);
        if (suite) {
            let fileUri = vscode.Uri.file(suite.runtime.results.expected.toString());
            if (target) {
                fileUri = fileUri.with({fragment: target});
            }
            const expectedUri = Result.fromUri(fileUri).toUri().with({query: 'type=flow'});
            vscode.commands.executeCommand('ply.openResult', expectedUri);
        } else {
            vscode.window.showErrorMessage(`Suite not found for: ${id}`);
        }
    }

    compareResults(uri: vscode.Uri, target?: string) {
        const id = this.getId(uri, target);
        console.debug(`compare: ${id}`);
        vscode.commands.executeCommand('ply.diff', id);
    }

    getInstance(uri: vscode.Uri): flowbee.FlowInstance | undefined {
        // instance from results
        const adapter = this.getAdapter(uri);
        const id = `flows|${uri.toString(true)}`;
        const suite = adapter.plyRoots.getSuite(id);
        if (suite) {
            return suite.runtime.results.flowInstanceFromActual(uri.fsPath);
        } else {
            throw new Error(`Flow not found: ${id}`);
        }
    }

    private getId(uri: vscode.Uri, target?: string): string {
        let id = uri.toString(true);
        if (target) {
            id += `#${target}`;
        } else {
            id = `flows|${id}`;
        }
        return id;
    }
}