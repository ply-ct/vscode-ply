import * as path from 'path';
import { Fs } from '../fs';
import * as vscode from 'vscode';
import { WebSocketServer } from 'ws';
import {
    Disposable,
    Listener,
    TypedEvent,
    FlowEvent,
    FlowInstance,
    SubflowSpec,
    Flow,
    getSubflowSpec,
    getSubflowSteps,
    Step
} from '@ply-ct/ply-api';
import { RunOptions, loadYaml, PlyResults } from '@ply-ct/ply';
import { Setting } from '../config';
import { WebSocketSender } from '../websocket';
import { AdapterHelper } from '../adapter-helper';
import { Web } from './web';
import { CreateFileOptions, WorkspaceFiles } from '../util/files';
import { Custom } from './custom';

export interface FlowItemSelectEvent {
    uri: vscode.Uri;
}
export interface FlowActionEvent {
    uri: vscode.Uri;
    action: string;
    options?: any;
}
export interface FlowModeChangeEvent {
    mode: 'select' | 'connect' | 'runtime';
}
interface InstanceSubscribed {
    instanceId: string;
}

export class FlowEditor implements vscode.CustomTextEditorProvider {
    private websocketPort: number;
    private websocketBound = false;
    private subscribedEvent = new TypedEvent<InstanceSubscribed>();

    onceWebviewReady?: (uri: vscode.Uri) => void;

    constructor(
        private context: vscode.ExtensionContext,
        private adapterHelper: AdapterHelper,
        private onFlowItemSelect: (listener: Listener<FlowItemSelectEvent>) => Disposable,
        private onFlowAction: (listener: Listener<FlowActionEvent>) => Disposable,
        private onFlowModeChange: (listener: Listener<FlowModeChangeEvent>) => Disposable
    ) {
        this.websocketPort = vscode.workspace
            .getConfiguration('ply')
            .get(Setting.websocketPort, 9351);
    }

    private bindWebsocket() {
        if (this.websocketPort && !this.websocketBound) {
            // websocket server for FlowEvents
            const webSocketServer = new WebSocketServer({ port: this.websocketPort });
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

        let disposables: { dispose(): void }[] = [];
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

        const adapter = this.adapterHelper.getAdapter(document.uri);

        const plyPath = this.adapterHelper.getConfig(document.uri).plyPath;
        const files = new WorkspaceFiles(document.uri, path.join(plyPath, 'templates'));

        const custom = new Custom(document.uri, files.workspaceFolder, adapter.log);
        disposables.push(custom);
        let customDescriptors = await custom.getDescriptors();

        const updateWebview = async () => {
            const isFile = document.uri.scheme === 'file';
            const msg = {
                type: 'update',
                base: baseUri.toString(),
                file: isFile ? document.uri.fsPath : document.uri.toString(),
                text: document.getText(),
                config: {
                    customDescriptors,
                    websocketPort: this.websocketPort,
                    showSourceTab: vscode.workspace
                        .getConfiguration('ply', document.uri)
                        .get('flowSourceTab', false)
                },
                readonly: !isFile || (await new Fs(document.uri).isReadonly())
            } as any;
            await webviewPanel.webview.postMessage(msg);
        };

        disposables.push(
            custom.onDescriptorsChange(async () => {
                customDescriptors = await custom.getDescriptors();
                updateWebview();
            })
        );

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === 'ready') {
                    await updateWebview();
                    const requests = await this.adapterHelper.getRequestDescriptors(document.uri);
                    webviewPanel.webview.postMessage({ type: 'requests', requests });
                    const subflows = await this.getSubflows(document);
                    webviewPanel.webview.postMessage({ type: 'subflows', subflows });
                    if (this.onceWebviewReady) {
                        this.onceWebviewReady(document.uri);
                        delete this.onceWebviewReady;
                    }
                } else if (message.type === 'change') {
                    const isNew = !document.getText().trim();
                    if (isNew) {
                        // applyEdit does not update file -- why?
                        new Fs(document.uri).writeFile(message.text);
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
                    const runOptions: RunOptions = {
                        ...(message.options || {}),
                        values: this.getOverrideValues(document.uri)
                    };
                    this.adapterHelper.run(document.uri, message.target, runOptions, debug);
                } else if (message.type === 'stop') {
                    this.adapterHelper.getAdapter(document.uri)?.cancel();
                    let instance;
                    let results;
                    try {
                        instance = this.getInstance(document.uri);
                        results = await this.adapterHelper.getPlyResults(document.uri);
                    } finally {
                        webviewPanel.webview.postMessage({
                            type: 'instance',
                            instance,
                            ...(results && { results }),
                            event: 'stop'
                        });
                    }
                } else if (message.type === 'new') {
                    if (message.element === 'file') {
                        // TODO conditional
                        const dlgOptions: CreateFileOptions = {
                            dirpath: 'src',
                            template: path.join('exec.ts.txt'),
                            filters: { 'TypeScript Source File': ['ts'] },
                            doOpen: true
                        };
                        const filepath = await files.createFile(dlgOptions);
                        if (filepath) {
                            webviewPanel.webview.postMessage({
                                type: 'step',
                                stepId: message.target,
                                file: filepath
                            });
                        }
                    } else if (message.element === 'custom') {
                        const customStepsPattern = custom.getCustomStepsPattern();
                        if (customStepsPattern) {
                            const tsPath = await files.createFile({
                                dirpath: 'src',
                                template: 'exec.ts.txt',
                                filters: { 'Custom Step TypeScript': ['ts'] },
                                doOpen: true
                            });
                            if (tsPath) {
                                // backslashes would need to be escaped in JSON
                                const dirpath = path.dirname(tsPath).replace(/\\/g, '/');
                                const basename = path.basename(tsPath, '.ts');
                                const jsonFile = await files.createFile({
                                    dirpath,
                                    filename: `${basename}.json`,
                                    template: 'descrip.json',
                                    substs: {
                                        '${stepName}': basename,
                                        '${tsPath}': tsPath,
                                        '${svgPath}': `${dirpath}/${basename}.svg`
                                    },
                                    doOpen: true
                                });
                                await files.createFile({
                                    dirpath,
                                    filename: `${basename}.svg`,
                                    template: 'icon.svg'
                                });
                                if (jsonFile) {
                                    const descriptorFiles = await vscode.workspace.findFiles(
                                        custom.getDescriptorPattern() || ''
                                    );
                                    const newDescriptorFile = descriptorFiles?.find((uri) => {
                                        return vscode.workspace.asRelativePath(uri) === jsonFile;
                                    });
                                    if (newDescriptorFile) {
                                        customDescriptors = await custom.getDescriptors();
                                        await vscode.commands.executeCommand(
                                            'vscode.open',
                                            document.uri
                                        );
                                        updateWebview();
                                    } else {
                                        vscode.window.showWarningMessage(
                                            `Custom step ${jsonFile} not found via pattern: '${customStepsPattern}'`
                                        );
                                    }
                                }
                            }
                        } else {
                            vscode.window.showWarningMessage(
                                `Custom steps pattern setting must be specified: 'ply.customSteps'`
                            );
                        }
                    } else if (message.element === 'request') {
                        vscode.commands.executeCommand('ply.new.request');
                    }
                } else if (message.type === 'select') {
                    if (message.element === 'file' || message.element === 'flow') {
                        const dlgOptions: vscode.OpenDialogOptions = {
                            openLabel: 'Select',
                            canSelectMany: false,
                            title:
                                message.element === 'flow'
                                    ? 'Select Ply Flow'
                                    : 'Select TypeScript File'
                        };
                        if (message.element === 'flow') {
                            dlgOptions.filters = { 'Ply Flow': ['ply.flow'] };
                        } else {
                            dlgOptions.filters = { 'TypeScript Source File': ['ts'] };
                        }
                        const selUris = await vscode.window.showOpenDialog(dlgOptions);
                        if (selUris?.length === 1) {
                            const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                            const filepath = files.pathInWorkspaceFolder(wsFolder!, selUris[0]);
                            if (filepath) {
                                const msg: any = {
                                    type: 'step',
                                    stepId: message.target
                                };
                                if (message.element === 'flow') {
                                    msg.flow = filepath;
                                } else {
                                    msg.file = filepath;
                                }
                                await webviewPanel.webview.postMessage(msg);
                                let subflows = await this.getSubflows(document);
                                if (!subflows.find((sf) => sf.subflow === filepath)) {
                                    const subflowSpec = await this.readSubflowSpec(document.uri, {
                                        id: message.target,
                                        attributes: { subflow: filepath }
                                    } as unknown as Step);
                                    if (subflowSpec) subflows = [...subflows, subflowSpec];
                                    webviewPanel.webview.postMessage({
                                        type: 'subflows',
                                        subflows
                                    });
                                }
                            }
                        }
                    }
                } else if (message.type === 'edit') {
                    if (message.element === 'file') {
                        const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        const fileUri = wsFolder!.uri.with({
                            path: `${wsFolder!.uri.path}/${
                                message.target ? message.target : message.path
                            }`
                        });
                        const filepath = files.pathInWorkspaceFolder(wsFolder!, fileUri);
                        if (filepath) {
                            if (fileUri.toString() === document.uri.toString()) {
                                // flow being edited -- open configurator on flow (from values link)
                                webviewPanel.webview.postMessage({
                                    type: 'action',
                                    action: 'configurator',
                                    options: { state: 'open', mode: 'select', tab: 'Input Values' }
                                });
                            } else {
                                await vscode.commands.executeCommand('vscode.open', fileUri);
                            }
                        }
                    } else if (message.element === 'request') {
                        let uri: vscode.Uri;
                        if (message.url) {
                            uri = vscode.Uri.parse(message.url);
                        } else {
                            uri = document.uri.with({
                                scheme: 'ply-request',
                                fragment: message.target
                            });
                        }
                        if (message.options?.overrides) {
                            this.setOverrideValues(uri, message.options.overrides);
                        }
                        vscode.commands.executeCommand('ply.open-request', { uri });
                    } else if (
                        message.element === 'flowInstance' &&
                        (message.path || message.target)
                    ) {
                        const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        const uri = wsFolder?.uri.with({
                            path: `${wsFolder.uri.path}/${message.path || message.target}`,
                            query: 'instance'
                        });
                        if (uri) {
                            await vscode.commands.executeCommand('ply.open-flow', { uri });
                        }
                    }
                } else if (message.type === 'expected') {
                    this.adapterHelper.expectedResult(document.uri, 'flow', message.target);
                } else if (message.type === 'compare') {
                    this.adapterHelper.compareResults(document.uri, message.target);
                } else if (message.type === 'instance') {
                    const instance = this.getInstance(document.uri);
                    let results: PlyResults | undefined;
                    if (!instance) {
                        this.promptToRunForInstance(document.uri);
                    } else {
                        results = await this.adapterHelper.getPlyResults(document.uri);
                    }
                    webviewPanel.webview.postMessage({
                        type: 'instance',
                        instance,
                        ...(results && { results })
                    });
                } else if (message.type === 'configurator') {
                    await vscode.commands.executeCommand('workbench.action.closePanel');
                } else if (message.type === 'save-values') {
                    this.setOverrideValues(document.uri, message.overrides || {});
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                if (doc.uri === document.uri) {
                    this.adapterHelper.removeActualResult(doc.uri);
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidChangeTextDocument((docChange) => {
                const uri = docChange.document.uri;
                if (uri.scheme === 'ply-request' && uri.fragment) {
                    const fileUri = uri.with({ scheme: 'file', fragment: '' });
                    if (fileUri.toString() === document.uri.toString()) {
                        webviewPanel.webview.postMessage({
                            type: 'step',
                            stepId: uri.fragment,
                            reqObj: loadYaml(uri.toString(), docChange.document.getText())
                        });
                        this.adapterHelper.removeActualResult(document.uri);
                    }
                }
            })
        );

        disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(async (tabChange) => {
                for (const tab of tabChange.changed) {
                    if (
                        tab.isActive &&
                        (tab.input as vscode.TabInputCustom)?.uri?.toString() ===
                            document.uri.toString()
                    ) {
                        const subflows = await this.getSubflows(document);
                        webviewPanel.webview.postMessage({ type: 'subflows', subflows });
                    }
                }
            })
        );

        disposables.push(
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
                const listener: Listener<FlowEvent> = async (flowEvent: FlowEvent) => {
                    if (flowEvent.flowPath === flowPath) {
                        if (
                            flowEvent.elementType === 'flow' &&
                            (flowEvent.eventType === 'start' ||
                                flowEvent.eventType === 'finish' ||
                                flowEvent.eventType === 'error')
                        ) {
                            let results: PlyResults | undefined;
                            if (flowEvent.eventType === 'start') {
                                flowInstanceId = null;
                            } else {
                                results = await this.adapterHelper.getPlyResults(document.uri);
                            }
                            // set the diagram instance so it'll start listening for websocket updates
                            webviewPanel.webview.postMessage({
                                type: 'instance',
                                instance: flowEvent.instance as FlowInstance,
                                event: flowEvent.eventType,
                                ...(results && { results })
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
                disposables.push(adapter.onFlow(listener));
            }

            const onValuesUpdate = async (resultUri?: vscode.Uri) => {
                const adapter = this.adapterHelper.getAdapter(document.uri);
                if (adapter?.values) {
                    const suiteId = this.adapterHelper.getId(document.uri);
                    const suite = adapter.plyRoots.getSuite(suiteId);
                    if (suite) {
                        const actualPath = suite.runtime.results.actual.toString();
                        if (!resultUri || actualPath === resultUri.fsPath.replace(/\\/g, '/')) {
                            webviewPanel.webview.postMessage({
                                type: 'values',
                                base: baseUri.toString(),
                                flowPath: document.uri.fsPath,
                                holders: await adapter.values.getValuesHolders(suiteId),
                                options: adapter.values.getEvalOptions(),
                                overrides: this.getOverrideValues(document.uri) || {}
                            });
                        }
                    }
                }
            };

            disposables.push(
                adapter.onLoad(async (loaded) => {
                    const requests = loaded.success
                        ? await this.adapterHelper.getRequestDescriptors(document.uri)
                        : [];
                    webviewPanel.webview.postMessage({ type: 'requests', requests });
                    const subflows = loaded.success ? await this.getSubflows(document) : [];
                    webviewPanel.webview.postMessage({ type: 'subflows', subflows });
                })
            );

            if (adapter.values) {
                disposables.push(
                    adapter.values.onValuesUpdate((updateEvent) =>
                        onValuesUpdate(updateEvent.resultUri)
                    )
                );
                // initial values
                webviewPanel.webview.postMessage({
                    type: 'values',
                    base: baseUri.toString(),
                    flowPath: document.uri.fsPath,
                    holders: await adapter.values.getValuesHolders(
                        this.adapterHelper.getId(document.uri)
                    ),
                    options: adapter.values.getEvalOptions(),
                    overrides: this.getOverrideValues(document.uri) || {}
                });
            } else {
                adapter.onceValues(async (e) => {
                    webviewPanel.webview.postMessage({
                        type: 'values',
                        base: baseUri.toString(),
                        flowPath: document.uri.fsPath,
                        holders: await adapter.values!.getValuesHolders(
                            this.adapterHelper.getId(document.uri)
                        ),
                        options: adapter.values!.getEvalOptions(),
                        overrides: this.getOverrideValues(document.uri) || {}
                    });
                    disposables.push(
                        e.values.onValuesUpdate((updateEvent) =>
                            onValuesUpdate(updateEvent.resultUri)
                        )
                    );
                });
            }

            disposables.push(
                this.onFlowAction(async (flowAction) => {
                    const flowUri = flowAction.uri.with({ fragment: '' });
                    if (flowUri.toString() === document.uri.toString() || flowUri.path === '/') {
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

        disposables.push(
            this.onFlowItemSelect((flowItemSelect) => {
                if (
                    flowItemSelect.uri.with({ fragment: '' }).toString() === document.uri.toString()
                ) {
                    webviewPanel.webview.postMessage({
                        type: 'select',
                        target: flowItemSelect.uri.fragment
                    });
                }
            })
        );

        disposables.push(
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

        webviewPanel.onDidDispose(() => {
            for (const disposable of disposables) {
                disposable.dispose();
            }
            disposables = [];
        });
    }

    /**
     * Instance from results
     */
    getInstance(uri: vscode.Uri): FlowInstance | undefined {
        const adapter = this.adapterHelper.getAdapter(uri);
        const id = `base|${uri.toString(true)}`;
        const suite = adapter.plyRoots.getSuite(id);
        if (suite) {
            return suite.runtime.results.flowInstanceFromActual(uri.fsPath);
        } else {
            throw new Error(`Flow not found: ${id}`);
        }
    }

    /**
     * Returns undefined if not in workspace folder
     */
    async pathInWorkspaceFolder(
        workspaceFolder: vscode.WorkspaceFolder,
        fileUri: vscode.Uri
    ): Promise<string | undefined> {
        const resourceWsFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (resourceWsFolder?.name === workspaceFolder.name) {
            return vscode.workspace.asRelativePath(fileUri, false);
        } else {
            vscode.window.showErrorMessage(
                `File must be under workspace folder ${workspaceFolder.name}`
            );
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

    private getOverrideValues(docUri: vscode.Uri): { [expr: string]: string } | undefined {
        return this.context.workspaceState.get(`${docUri}/ply-user-values`);
    }

    private setOverrideValues(docUri: vscode.Uri, overrides: { [expr: string]: string }) {
        this.context.workspaceState.update(
            `${docUri}/ply-user-values`,
            Object.keys(overrides).length ? overrides : undefined
        );
    }

    private async getSubflows(document: vscode.TextDocument): Promise<SubflowSpec[]> {
        const before = Date.now();
        const flow = loadYaml(document.uri.fsPath, document.getText()) as Flow;
        const specs: SubflowSpec[] = [];
        if (flow) {
            // check not needed after #14
            for (const subflowStep of getSubflowSteps(flow)) {
                const spec = await this.readSubflowSpec(document.uri, subflowStep);
                if (spec) specs.push(spec);
            }
        }

        console.debug(`Loaded subflows in: ${Date.now() - before} ms`);
        return specs;
    }

    private async readSubflowSpec(
        docUri: vscode.Uri,
        subflowStep: Step
    ): Promise<SubflowSpec | undefined> {
        if (subflowStep.attributes?.subflow) {
            const wsFolderUri = this.adapterHelper.getWorkspaceFolder(docUri).uri;
            const subflowDoc = await vscode.workspace.openTextDocument(
                wsFolderUri.with({
                    path: `${wsFolderUri.path}/${subflowStep.attributes.subflow}`
                })
            );
            if (subflowDoc) {
                const subflow = loadYaml(subflowDoc.uri.fsPath, subflowDoc.getText()) as Flow;
                return getSubflowSpec(subflowStep, subflow);
            }
        }
    }
}
