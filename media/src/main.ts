import * as flowbee from 'flowbee/dist/nostyles';
import { Options } from './options';
import { Templates } from './templates';
import { FlowSplitter, ToolboxSplitter } from './splitter';
import {
    DrawingTools,
    OptionToggleEvent,
    FlowActions,
    FlowActionEvent,
    ZoomChangeEvent
} from './actions';
import { descriptors } from './descriptors';
import { MenuProvider } from './menu';
import { Request } from './request';
import { Values } from './values';

// @ts-ignore
const vscode = acquireVsCodeApi();
const EOL = navigator.platform.indexOf('Win') > -1 ? '\r\n' : '\n';

let templates: Templates;
let values: Values;

interface Confirmation {
    result: boolean;
}
const dlgEvt = new flowbee.TypedEvent<Confirmation>();

class DialogProvider implements flowbee.DialogProvider {
    alert(message: flowbee.DialogMessage) {
        vscode.postMessage({ type: 'alert', message });
    }
    async confirm(message: flowbee.DialogMessage): Promise<boolean> {
        const promise = new Promise<boolean>((resolve) => {
            dlgEvt.once((e) => {
                resolve(e.result);
            });
        });
        vscode.postMessage({ type: 'confirm', message });
        return promise;
    }
}

let oldFlow: flowbee.Disposable;
let requests: (flowbee.Descriptor & { request: Request })[] = [];

export class Flow implements flowbee.Disposable {
    readonly options: Options;
    readonly flowDiagram: flowbee.FlowDiagram;
    readonly flowActions?: FlowActions;
    private readonly drawingTools?: DrawingTools;
    private readonly toolbox?: flowbee.Toolbox;
    private requestsToolbox?: flowbee.Toolbox;
    private disposables: flowbee.Disposable[] = [];
    static configurator?: flowbee.Configurator;

    /**
     * @param readonly file is readonly
     */
    constructor(
        private base: string,
        readonly websocketPort: number,
        text: string,
        private file: string,
        private readonly: boolean
    ) {
        oldFlow?.dispose();
        oldFlow = this;
        const webSocketUrl = `ws://localhost:${websocketPort}/websocket`;
        this.options = new Options(base, webSocketUrl);
        this.options.theme = document.body.className.endsWith('vscode-dark') ? 'dark' : 'light';

        // configurator
        if (!Flow.configurator) {
            Flow.configurator = new flowbee.Configurator(
                document.getElementById('flow-diagram') as HTMLElement
            );
        }
        this.disposables.push(
            Flow.configurator.onFlowElementUpdate((e) => {
                if (e.action === 'edit_request') {
                    let id = this.flowDiagram.flow.steps?.find((s) => s.id === e.element.id)?.id;
                    if (!id && this.flowDiagram.flow.subflows) {
                        for (const subflow of this.flowDiagram.flow.subflows) {
                            id = subflow.steps?.find((s) => s.id === e.element.id)?.id;
                            if (id) {
                                id = `${subflow.id}.${id}`;
                                break;
                            }
                        }
                    }
                    vscode.postMessage({ type: 'edit', element: 'request', target: id });
                } else {
                    this.updateFlow();
                }
            })
        );
        this.disposables.push(
            Flow.configurator.onReposition((repositionEvent) => {
                updateState({
                    configurator: {
                        open: !!repositionEvent.position,
                        position: repositionEvent.position
                    }
                });
            })
        );

        // theme-based icons (lastly make flow header visible)
        const toolImgs = [
            ...document.querySelectorAll('input[type=image]'),
            ...document.querySelectorAll('img')
        ] as HTMLInputElement[];
        for (const toolImg of toolImgs) {
            if (toolImg.hasAttribute('data-icon')) {
                const icon = toolImg.getAttribute('data-icon') as string;
                toolImg.setAttribute('src', `${this.options.iconBase}/${icon}`);
                toolImg.style.display = 'inline-block';
            }
        }
        (document.getElementById('flow-header') as HTMLDivElement).style.display = 'flex';

        // diagram
        const canvasElement = document.getElementById('diagram-canvas') as HTMLCanvasElement;
        this.flowDiagram = new flowbee.FlowDiagram(
            text,
            canvasElement,
            file,
            descriptors,
            this.options.diagramOptions
        );
        this.disposables.push(this.flowDiagram.onFlowChange((_e) => this.updateFlow()));
        this.disposables.push(
            this.flowDiagram.onFlowElementAdd((onAdd) => {
                if (onAdd.descriptor.link) {
                    // dragged from requests toolpane
                    const request = requests.find((req) => {
                        return req.link?.url && req.link.url === onAdd.descriptor.link?.url;
                    });
                    if (request) {
                        if ((onAdd.element as any).name) {
                            (onAdd.element as any).name = `${(onAdd.element as any).name} Copy`;
                        }
                        if (!onAdd.element.attributes) onAdd.element.attributes = {};
                        onAdd.element.attributes.url = request.request.url;
                        onAdd.element.attributes.method = request.request.method;
                        if (request.request.headers) {
                            const headers: string[][] = [];
                            Object.keys(request.request.headers).forEach((header) => {
                                headers.push([header, request.request.headers[header]]);
                            });
                            onAdd.element.attributes.headers = JSON.stringify(headers);
                        }
                        if (request.request.body) {
                            onAdd.element.attributes.body = request.request.body;
                        }
                        const step = this.findStep(onAdd.element.id || '');
                        if (step) {
                            step.name = (onAdd.element as any).name;
                            // redraw to reflect name
                            this.flowDiagram.render(this.options.diagramOptions);
                        }
                    }
                }
                this.updateConfigurator(
                    onAdd.element,
                    undefined,
                    onAdd.descriptor.path === 'request'
                );
            })
        );

        this.flowDiagram.dialogProvider = new DialogProvider();
        const menuProvider = new MenuProvider(
            this.flowDiagram,
            this.updateConfigurator,
            templates,
            this.options
        );
        this.flowDiagram.contextMenuProvider = menuProvider;
        this.disposables.push(
            this.flowDiagram.onFlowElementSelect(async (flowElementSelect) => {
                updateState({ selected: { id: flowElementSelect.element.id } });
                if (Flow.configurator) {
                    this.updateConfigurator(flowElementSelect.element, flowElementSelect.instances);
                }
            })
        );
        this.disposables.push(
            this.flowDiagram.onFlowElementDrill(async (flowElementDrill) => {
                if (Flow.configurator && this.flowDiagram.mode !== 'connect') {
                    this.updateConfigurator(
                        flowElementDrill.element,
                        flowElementDrill.instances,
                        true
                    );
                }
            })
        );
        this.disposables.push(
            this.flowDiagram.onFlowElementUpdate(async (flowElementUpdate) => {
                if (Flow.configurator?.flowElement?.id === flowElementUpdate.element.id) {
                    this.updateConfigurator(flowElementUpdate.element);
                }
            })
        );

        const toolboxContainer = document.getElementById('toolbox-container') as HTMLDivElement;
        const flowHeader = document.querySelector('.flow-header') as HTMLDivElement;
        if (readonly) {
            toolboxContainer.style.display = 'none';
            flowHeader.innerHTML = '';
        } else {
            const toolboxElement = document.getElementById('flow-toolbox') as HTMLDivElement;
            toolboxElement.innerHTML = '';
            this.toolbox = new flowbee.Toolbox(descriptors, toolboxElement);

            // open/close toolbox
            const toolboxHeader = toolboxContainer.querySelector(
                '.toolbox-header'
            ) as HTMLDivElement;
            toolboxHeader.style.cursor = 'pointer';
            const toolboxCaret = flowHeader.querySelector('.toolbox-caret') as HTMLSpanElement;
            toolboxCaret.style.display = 'none';
            toolboxHeader.onclick = (_e: MouseEvent) => {
                toolboxContainer.style.display = 'none';
                toolboxCaret.style.display = 'inline-block';
            };
            toolboxCaret.onclick = (_e: MouseEvent) => {
                toolboxCaret.style.display = 'none';
                toolboxContainer.style.display = 'flex';
            };

            // requests tool pane
            const requestsToolboxElement = document.getElementById(
                'flow-requests'
            ) as HTMLDivElement;
            requestsToolboxElement.innerHTML = '';
            this.requestsToolbox = new flowbee.Toolbox(requests, requestsToolboxElement);

            // flow splitter
            const containerElement = document.getElementById('container') as HTMLDivElement;
            new FlowSplitter(containerElement, toolboxContainer, toolboxCaret);

            // toolbox splitter
            const toolboxSplitter = new ToolboxSplitter(toolboxContainer);
            // new request
            const newRequest = document.getElementById('newRequest') as HTMLInputElement;
            newRequest.onclick = (_e: MouseEvent) => {
                toolboxSplitter.toggleFlowRequests();
                vscode.postMessage({ type: 'new', element: 'request' });
            };

            // actions
            this.drawingTools = new DrawingTools(
                document.getElementById('flow-header') as HTMLDivElement
            );
            this.drawingTools.onOptionToggle((e) => this.onOptionToggle(e));
            this.drawingTools.onZoomChange((e: ZoomChangeEvent) => {
                this.flowDiagram.zoom = e.zoom;
            });
            this.switchMode('select');

            this.flowActions = new FlowActions(
                this.options.iconBase,
                document.getElementById('flow-actions') as HTMLDivElement
            );
            const handleFlowAction = (e: FlowActionEvent) => {
                if (
                    e.action === 'submit' ||
                    e.action === 'run' ||
                    e.action === 'debug' ||
                    e.action === 'stop'
                ) {
                    this.closeConfigurator();
                    if (!e.target) {
                        this.flowDiagram.render(this.options.diagramOptions);
                    }
                }
                if (e.action === 'submit') {
                    this.onFlowAction({ action: 'run', options: { submit: true } });
                } else {
                    this.onFlowAction(e);
                }
            };
            this.flowActions.onFlowAction(handleFlowAction);
            menuProvider.onFlowAction(handleFlowAction);
        }
    }

    switchMode(mode: flowbee.Mode) {
        this.flowDiagram.mode = mode;
        this.drawingTools?.switchMode(mode);
        this.flowDiagram.readonly = mode === 'runtime' || this.readonly;
    }

    render() {
        this.flowDiagram.render(this.options.diagramOptions);
        if (!this.readonly) {
            this.toolbox?.render(this.options.toolboxOptions);
            this.updateRequests(requests);
        }
        if (Flow.configurator?.isOpen) {
            const cfgr = Flow.configurator;
            cfgr.render(
                cfgr.flowElement,
                cfgr.instance ? [cfgr.instance] : [],
                cfgr.template || {},
                this.options.configuratorOptions
            );
            if (cfgr.flowElement.id) {
                this.flowDiagram.select(cfgr.flowElement.id);
            }
        }
    }

    updateRequests(reqs: (flowbee.Descriptor & { request: Request })[]) {
        requests = reqs;
        const requestsToolboxElement = document.getElementById('flow-requests') as HTMLDivElement;
        requestsToolboxElement.innerHTML = '';
        this.requestsToolbox = new flowbee.Toolbox(requests, requestsToolboxElement);
        this.disposables.push(
            this.requestsToolbox.onItemOpen((openEvent) => {
                vscode.postMessage({ type: 'edit', element: 'request', url: openEvent.url });
            })
        );
        this.requestsToolbox.render(this.options.toolboxOptions);
    }

    findStep(stepId: string) {
        let step = this.flowDiagram.flow.steps?.find((s) => s.id === stepId);
        if (step) return step;
        if (this.flowDiagram.flow.subflows) {
            for (let i = 0; i < this.flowDiagram.flow.subflows.length; i++) {
                const subflow = this.flowDiagram.flow.subflows[i];
                step = subflow.steps?.find((s) => s.id === stepId);
                if (step) return step;
            }
        }
    }

    updateStep(stepId: string, reqObj: object) {
        const step = this.findStep(stepId);
        if (step) {
            const reqName = Object.keys(reqObj)[0];
            step.name = reqName.replace(/_/g, EOL);
            if (!step.attributes) step.attributes = {};
            const req = (reqObj as any)[reqName];
            step.attributes.url = req.url;
            step.attributes.method = req.method;
            if (req.headers) {
                const rows: string[][] = [];
                for (const key of Object.keys(req.headers)) {
                    rows.push([key, '' + req.headers[key]]);
                }
                step.attributes.headers = JSON.stringify(rows);
            }
            if (req.body) step.attributes.body = req.body;
            this.updateFlow(false);
        }
    }

    async updateConfigurator(
        flowElement: flowbee.FlowElement,
        instances?: flowbee.FlowElementInstance[],
        doOpen = false,
        position?: { left: number; top: number; width: number; height: number }
    ) {
        if (Flow.configurator && (doOpen || Flow.configurator?.isOpen)) {
            const template = await templates.get(
                flowElement,
                this.flowDiagram.mode === 'runtime' ? 'inspect' : 'config'
            );
            if (instances && instances.length > 0) {
                const instance = instances[instances.length - 1] as any;
                if (instance.data?.request) {
                    instance.request = instance.data.request;
                    if (instance.data.response) {
                        instance.response = instance.data.response;
                    }
                }
            }
            if (!Flow.configurator.isOpen) {
                // close bottom panel to avoid obscuring configurator
                vscode.postMessage({ type: 'configurator' });
            }

            Flow.configurator.render(
                flowElement,
                instances || [],
                template,
                this.options.configuratorOptions,
                position
            );
            updateState({
                selected: {
                    id: flowElement.id,
                    instances: instances
                },
                configurator: {
                    open: true,
                    position: {
                        left: Flow.configurator.left,
                        top: Flow.configurator.top,
                        width: Flow.configurator.width,
                        height: Flow.configurator.height
                    }
                }
            });
        }
    }

    openConfigurator() {
        if (Flow.configurator && !Flow.configurator.isOpen) {
            this.updateConfigurator(
                this.flowDiagram.flow,
                this.flowDiagram.instance ? [this.flowDiagram.instance] : [],
                true
            );
        }
    }

    closeConfigurator() {
        Flow.configurator?.close();
        updateState({ configurator: { open: false } });
    }

    onOptionToggle(e: OptionToggleEvent) {
        const drawingOption = e.option;
        if (
            drawingOption === 'select' ||
            drawingOption === 'connect' ||
            drawingOption === 'runtime'
        ) {
            this.flowDiagram.mode = drawingOption;
            if (drawingOption === 'connect') {
                this.closeConfigurator();
                this.flowDiagram.instance = null;
                this.flowDiagram.readonly = this.readonly;
                this.flowActions?.enableCompare(false);
                updateState({ mode: drawingOption });
                this.flowDiagram.focus();
            } else if (drawingOption === 'runtime') {
                this.closeConfigurator();
                vscode.postMessage({
                    type: 'instance'
                });
                // state update pending instance postback
            } else {
                if (Flow.configurator) {
                    this.updateConfigurator(Flow.configurator.flowElement);
                }
                this.flowDiagram.instance = null;
                this.flowDiagram.readonly = this.readonly;
                this.flowActions?.enableCompare(false);
                updateState({ mode: drawingOption });
            }
        } else {
            (this.options as any)[drawingOption] = !(this.options as any)[drawingOption];
        }
        this.flowDiagram.render(this.options.diagramOptions);
    }

    async onFlowAction(e: FlowActionEvent) {
        const flowAction = e.action;
        let step: flowbee.Step | undefined;
        if (typeof e.target === 'string' && e.target.startsWith('s')) {
            step = this.flowDiagram.flow.steps?.find((step) => step.id === e.target);
            if (!step && this.flowDiagram.flow.subflows) {
                // check subflows for target
                for (const subflow of this.flowDiagram.flow.subflows) {
                    step = subflow.steps?.find((step) => step.id === e.target);
                    if (step) {
                        e.target = `${subflow.id}.${step.id}`;
                        break;
                    }
                }
            }
        }
        let vals: object | 'Files' | undefined;
        if (flowAction === 'run' || flowAction === 'values') {
            this.closeConfigurator();
            if (values && (flowAction === 'values' || !values.isRows)) {
                const action = e.options?.submit ? 'Submit' : 'Run';
                const onlyIfNeeded = !step && e.action !== 'values';
                const storageCall = async (key: string, storeVals?: { [key: string]: string }) => {
                    if (values.storeVals) {
                        values.storeVals[key] = storeVals;
                        updateState({ storeVals });
                        vscode.postMessage({ type: 'values', key, storeVals });
                    }
                };
                vals = await values.prompt(
                    step || this.flowDiagram.flow,
                    action,
                    onlyIfNeeded,
                    storageCall
                );
                if (vals === 'Files') {
                    vscode.postMessage({ type: 'valuesFiles' });
                    return;
                } else if (!vals) {
                    return; // canceled or just saved
                }
            } else if (flowAction === 'values') {
                vscode.postMessage({ type: 'alert', message: { text: 'No values known' } });
                return;
            }
        }
        vscode.postMessage({
            type: flowAction === 'values' ? 'run' : flowAction, // can elect Run from values prompt even when launched as 'values' action
            flow: this.flowDiagram.flow.path,
            ...(e.target && { target: e.target }),
            ...(e.options && { options: e.options }),
            ...(vals && { values: vals })
        });
    }

    /**
     * Update the flow diagram document.
     */
    updateFlow(post = true) {
        const indent = this.options.indent;
        const text = this.options.yaml
            ? this.flowDiagram.toYaml(indent)
            : this.flowDiagram.toJson(indent);

        if (post) {
            vscode.postMessage({
                type: 'change',
                text
            });
        }

        updateState({
            base: this.base,
            file: this.file,
            text,
            config: { websocketPort: this.websocketPort },
            readonly: this.flowDiagram.readonly,
            mode: 'select'
        });
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

window.addEventListener('message', async (event) => {
    const message = event.data; // json message data from extension
    console.debug(`message: ${JSON.stringify(message, null, 2)}`);
    if (message.type === 'update') {
        if (!templates) {
            templates = new Templates(message.base);
        }
        let text = message.text?.trim();
        let isNew = false;
        if (!text) {
            // new flow
            isNew = true;
            text = await templates.get('default.flow');
        }
        const websocketPort = message.config.websocketPort;
        const flow = new Flow(message.base, websocketPort, text, message.file, message.readonly);
        flow.switchMode('select');
        flow.flowDiagram.readonly = message.readonly;
        if (isNew) {
            if (message.readonly) {
                // new and readonly means blank
                updateState({ readonly: true });
                document.getElementById('container')!.style.visibility = 'hidden';
                return;
            } else {
                console.info(`Saving new flow: ${message.file}`);
                flow.updateFlow();
            }
        }
        flow.render();
        // save state
        updateState({
            base: message.base,
            file: message.file,
            text,
            readonly: message.readonly,
            mode: 'select',
            config: { websocketPort },
            values: values?.defaults
        });
        if (message.select) {
            let id = message.select;
            const dot = id.indexOf('.');
            if (dot > 0) {
                id = id.substring(dot + 1);
            }
            flow.flowDiagram.select(id, true);
        }
    } else if (message.type === 'instance') {
        const flow = readState(false);
        if (flow) {
            flow.flowDiagram.instance = message.instance;
            const hasInstance = !!flow.flowDiagram.instance;
            flow.flowActions?.setRunning(hasInstance && message.event === 'start');
            if (hasInstance) {
                flow.flowDiagram.readonly = true;
                flow.switchMode('runtime');
                updateState({ mode: 'runtime' });
            } else {
                flow.switchMode(flow.flowDiagram.mode);
            }
            flow.flowActions?.enableCompare(hasInstance);
        }
    } else if (message.type === 'requests') {
        const flow = readState(false);
        if (flow) {
            flow.updateRequests(message.requests);
        }
        updateState({ requests: message.requests });
    } else if (message.type === 'step') {
        const flow = readState(false);
        if (flow) {
            flow.updateStep(message.stepId, message.reqObj);
        }
    } else if (message.type === 'values') {
        const theme = document.body.className.endsWith('vscode-dark') ? 'dark' : 'light';
        values = new Values(
            `${message.flowPath}`,
            `${message.base}/img/icons/${theme}`,
            message.files,
            message.values,
            message.storeVals
        );
        updateState({
            valuesFiles: message.files,
            values: message.values,
            storeVals: message.storeVals
        });
    } else if (message.type === 'action') {
        readState()?.onFlowAction({
            action: message.action,
            target: message.target,
            options: message.options
        });
    } else if (message.type === 'mode') {
        updateState({ mode: message.mode });
        const flow = readState();
        if (flow) {
            flow.switchMode(message.mode);
        }
    } else if (message.type === 'theme-change') {
        readState();
    } else if (message.type === 'confirm') {
        dlgEvt.emit({ result: message.result });
    } else if (message.type === 'open-configurator') {
        const flow = readState();
        flow?.openConfigurator();
    }
});

interface FlowState {
    base?: string;
    file?: string;
    text?: string;
    readonly?: boolean; // this means the file is readonly
    mode?: flowbee.Mode;
    config?: {
        websocketPort: number;
    };
    selected?: {
        id?: string; // selected but no id means flow selected
        instances?: flowbee.FlowElementInstance[];
    };
    configurator?: {
        open: boolean;
        position?: { left: number; top: number; width: number; height: number };
    };
    valuesFiles?: string[];
    values?: object;
    storeVals?: any;
    requests?: flowbee.Descriptor[];
}

function updateState(delta: FlowState) {
    vscode.setState({ ...vscode.getState(), ...delta });
}

function readState(loadInstance = true): Flow | undefined {
    const state = vscode.getState();
    if (state && state.base && state.file) {
        templates = new Templates(state.base);
        const flow = new Flow(
            state.base,
            state.config?.websocketPort || 0,
            state.text,
            state.file,
            state.readonly
        );
        flow.flowDiagram.readonly = state.readonly;
        const mode = state.mode || 'select';
        if (mode === 'runtime' && loadInstance) {
            vscode.postMessage({
                type: 'instance'
            });
        }
        flow.switchMode(mode);
        flow.flowActions?.enableCompare(!!flow.flowDiagram.instance);
        requests = state.requests || [];
        flow.render();
        if (state.selected) {
            if (state.selected.id) {
                flow.flowDiagram.select(state.selected.id, false);
            }
            if (state.configurator?.open) {
                const selected = flow.flowDiagram.selected;
                const flowElem = selected.length === 1 ? selected[0] : flow.flowDiagram.flow;
                const instances = state.selected.instances || [];
                if (instances.length > 0 || flow.flowDiagram.mode !== 'runtime') {
                    flow.updateConfigurator(flowElem, instances, true, state.configurator.position);
                }
            }
        }
        if (state.values) {
            values = new Values(
                state.file,
                flow.options.iconBase,
                state.valuesFiles,
                state.values,
                state.storeVals
            );
        }
        return flow;
    }
}

readState();
