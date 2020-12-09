import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as flowbee from 'flowbee';
import { PlyAdapter } from '../adapter';
import { PlyRoots } from '../plyRoots';
import { Setting } from '../config';
import { WebSocketSender } from '../websocket';

interface InstanceSubscribed { instanceId: string }

export class FlowEditor implements vscode.CustomTextEditorProvider {

    private static html: string;
    private websocketPort: number;
    private disposables: flowbee.Disposable[] = [];
    private flowListeners: flowbee.Listener<flowbee.FlowEvent>[] = [];
    private subscribedEvent = new flowbee.TypedEvent<InstanceSubscribed>();

    constructor(
        readonly context: vscode.ExtensionContext,
        readonly adapters: Map<string,PlyAdapter>
    ) {
        this.websocketPort = vscode.workspace.getConfiguration('ply').get(Setting.websocketPort, 7001);
        if (this.websocketPort) {
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
            webSocketServer.on('error', error => {
                console.error(error);
            });
            webSocketServer.on('close', () => {
                WebSocketSender.unsubscribe();
            });
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

        // substitute the nonce every time
        let html = FlowEditor.html.replace(/\${cspSource}/g, webviewPanel.webview.cspSource);
        html = html.replace(/\${nonce}/g, this.getNonce());
        webviewPanel.webview.html = html;

        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath));
        const websocketPort = this.websocketPort;
        function updateWebview(instance?: flowbee.FlowInstance) {
            const msg = {
                type: 'update',
                base: baseUri.toString(),
                websocketPort,
                file: document.uri.fsPath,
                text: document.getText(),
                readonly: (fs.statSync(document.uri.fsPath).mode & 146) === 0
            } as any;
            if (instance) {
                msg.instance = instance;
            }
            webviewPanel.webview.postMessage(msg);
        }

        this.disposables.push(webviewPanel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'change') {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, document.lineCount, 0),
                    message.text
                );
                return vscode.workspace.applyEdit(edit);
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
                this.runFlow(document.uri, message.type === 'debug');
            } else if (message.type === 'compare') {
                this.compareResults(document.uri);
            } else if (message.type === 'instance') {
                updateWebview(this.getInstance(document.uri));
            }
        }));

        this.disposables.push(vscode.workspace.onDidChangeConfiguration(configChange => {
            if (configChange.affectsConfiguration('workbench.colorTheme')) {
                updateWebview();
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
            for (const handler of this.flowListeners) {
                adapter.removeFlowListener(handler);
            }
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
            this.flowListeners.push(listener);
            adapter.onFlow(listener);
        }

        webviewPanel.onDidDispose(() => {
            for (const disposable of this.disposables) {
                disposable.dispose();
            }
            this.disposables = [];
        });

        updateWebview();
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

    async runFlow(uri: vscode.Uri, debug = false) {
        try {
            console.debug(`run flow: ${uri}`);
            const adapter = this.getAdapter(uri);
            await adapter.run([`flows|${uri.toString(true)}`]); // TODO RunOptions?
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    }

    compareResults(uri: vscode.Uri) {
        // TODO hardcoded
        vscode.commands.executeCommand('ply.diff', `${uri.toString(true)}#movies-api.ply.flow`);
    }

    getInstance(uri: vscode.Uri): flowbee.FlowInstance | undefined {
        // instance from results
        const adapter = this.getAdapter(uri);
        const testId = `${uri}#${path.basename(uri.fsPath)}`;
        const suite = adapter.plyRoots.getSuiteForTest(testId);
        if (suite) {
            return suite.runtime.results.flowInstanceFromActual(uri.fsPath);
        } else {
            throw new Error(`Suite not found for test: ${testId}`);
        }
    }
}