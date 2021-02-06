import * as flowbee from 'flowbee/dist/nostyles';
import { Options } from './options';
import { Templates } from './templates';
import { Splitter } from './splitter';
import {
    DrawingTools,
    OptionToggleEvent,
    FlowActions,
    FlowActionEvent,
    ZoomChangeEvent
} from './actions';
import { descriptors } from './descriptors';
import { MenuProvider } from './menu';
import { Values } from './values';

// @ts-ignore
const vscode = acquireVsCodeApi();

let templates: Templates;
let values: Values;

interface Confirmation { result: boolean }
const evt = new flowbee.TypedEvent<Confirmation>();

class DialogProvider implements flowbee.DialogProvider {
    alert(message: flowbee.DialogMessage) {
        vscode.postMessage({ type: 'alert', message });
    }
    async confirm(message: flowbee.DialogMessage): Promise<boolean> {
        const promise = new Promise<boolean>(resolve => {
            evt.once(e =>  {
                resolve(e.result);
            });
        });
        vscode.postMessage({ type: 'confirm', message });
        return promise;
    }
}

export type DrawingMode = 'select' | 'connect' | 'runtime';

export class Flow {

    readonly options: Options;
    readonly flowDiagram: flowbee.FlowDiagram;
    readonly flowActions: FlowActions;
    readonly toolbox: flowbee.Toolbox;
    static configurator?: flowbee.Configurator;

    constructor(private base: string, websocketPort: number, text: string, private file: string, mode: DrawingMode) {
        const webSocketUrl = `ws://localhost:${websocketPort}/websocket`;
        this.options = new Options(base, webSocketUrl);
        this.options.theme = document.body.className.endsWith('vscode-dark') ? 'dark': 'light';

        // configurator
        if (!Flow.configurator) {
            // TODO dispose listener
            Flow.configurator = new flowbee.Configurator(document.getElementById('flow-diagram') as HTMLElement);
            Flow.configurator.onFlowElementUpdate(_e => this.updateFlow());
        }

        // theme-based icons
        for (const toolIcon of document.querySelectorAll('input[type=image]')) {
            if (toolIcon.hasAttribute('data-icon')) {
                const icon = toolIcon.getAttribute('data-icon') as string;
                toolIcon.setAttribute('src', `${this.options.iconBase}/${icon}`);
            }
        }

        // diagram
        const canvasElement = document.getElementById('diagram-canvas') as HTMLCanvasElement;
        this.flowDiagram = new flowbee.FlowDiagram(text, canvasElement, file, descriptors, this.options.diagramOptions);
        this.flowDiagram.mode = mode;
        this.flowDiagram.onFlowChange(_e => this.updateFlow());
        this.flowDiagram.dialogProvider = new DialogProvider();
        const menuProvider = new MenuProvider(this.flowDiagram, Flow.configurator, templates, this.options);
        this.flowDiagram.contextMenuProvider = menuProvider;
        this.flowDiagram.onFlowElementSelect(async flowElementSelect => {
            if (Flow.configurator) {
                this.updateConfigurator(flowElementSelect.element, flowElementSelect.instances);
            }
        });
        this.flowDiagram.onFlowElementDrill(async flowElementDrill => {
            if (Flow.configurator) {
                this.updateConfigurator(flowElementDrill.element, flowElementDrill.instances, true);
            }
        });
        this.flowDiagram.onFlowElementUpdate(async flowElementUpdate => {
            if (Flow.configurator?.flowElement?.id === flowElementUpdate.element.id) {
                this.updateConfigurator(flowElementUpdate.element);
            }
        });

        const toolboxElement = document.getElementById('flow-toolbox') as HTMLDivElement;
        toolboxElement.innerHTML = '';
        this.toolbox = new flowbee.Toolbox(descriptors, toolboxElement);

        // open/close toolbox
        const toolboxContainer = document.getElementById('toolbox-container') as HTMLDivElement;
        const toolboxHeader = toolboxContainer.querySelector('.toolbox-header') as HTMLDivElement;
        toolboxHeader.style.cursor = 'pointer';
        const flowHeader = document.querySelector('.flow-header') as HTMLDivElement;
        const toolboxCaret = flowHeader.querySelector('.toolbox-caret') as HTMLSpanElement;
        toolboxCaret.style.display = 'none';
        toolboxHeader.onclick = (_e: MouseEvent) => {
            toolboxContainer.style.display = 'none';
            toolboxCaret.style.display = 'inline-block';
        };
        toolboxCaret.onclick = (_e: MouseEvent) => {
            toolboxCaret.style.display = 'none';
            toolboxContainer.style.display = 'inline-block';
        };

        // splitter
        const containerElement = document.getElementById('container') as HTMLDivElement;
        new Splitter(containerElement, toolboxContainer, toolboxCaret);

        // actions
        const drawingTools = new DrawingTools(document.getElementById('flow-header') as HTMLDivElement);
        drawingTools.switchMode(mode);
        drawingTools.onOptionToggle(e => this.onOptionToggle(e));
        drawingTools.onZoomChange((e: ZoomChangeEvent) => {
            this.flowDiagram.zoom = e.zoom;
        });
        this.flowActions = new FlowActions(document.getElementById('flow-actions') as HTMLDivElement);
        const handleFlowAction = (e: FlowActionEvent) => {
            if (e.action === 'submit' || e.action === 'run' || e.action === 'debug') {
                Flow.configurator?.close();
                if (!e.target) {
                    drawingTools.switchMode('runtime');
                    this.flowDiagram.mode = 'runtime';
                    this.flowDiagram.render(this.options.diagramOptions);
                }
            }
            if (e.action === 'submit') {
                this.onFlowAction({ action: 'run', options: { submit: true }});
            } else {
                this.onFlowAction(e);
            }
        };
        this.flowActions.onFlowAction(handleFlowAction);
        menuProvider.onFlowAction(handleFlowAction);
    }

    render() {
        this.flowDiagram.render(this.options.diagramOptions);
        this.toolbox.render(this.options.toolboxOptions);
        if (Flow.configurator?.isOpen) {
            const cfgr = Flow.configurator;
            cfgr.render(cfgr.flowElement, cfgr.instance ? [cfgr.instance] : [], cfgr.template || {}, this.options.configuratorOptions);
            if (cfgr.flowElement.id) {
                this.flowDiagram.select(cfgr.flowElement.id);
            }
        }
    }

    async updateConfigurator(flowElement: flowbee.FlowElement, instances?: flowbee.FlowElementInstance[], doOpen = false) {
        if (Flow.configurator && (doOpen || Flow.configurator?.isOpen)) {
            const template = await templates.get(flowElement, this.flowDiagram.mode === 'runtime' ? 'inspect' : 'config');
            if (instances && instances.length > 0) {
                const instance = instances[instances.length - 1] as any;
                if (instance.data?.request) {
                    instance.request = instance.data.request;
                    if (instance.data.response) {
                        instance.response = instance.data.response;
                    }
                }
            }
            Flow.configurator.render(flowElement, instances || [], template, this.options.configuratorOptions);
        }
    }

    onOptionToggle(e: OptionToggleEvent) {
        const drawingOption = e.option;
        if (drawingOption === 'select' || drawingOption === 'connect' || drawingOption === 'runtime') {
            this.flowDiagram.mode = drawingOption;
            if (drawingOption === 'select') {
                if (Flow.configurator) {
                    this.updateConfigurator(Flow.configurator.flowElement);
                }
                this.flowDiagram.instance = null;
                this.flowDiagram.readonly = false; // TODO could be readonly on file system
                this.flowActions.enableCompare(false);
            } else if (drawingOption === 'runtime') {
                Flow.configurator?.close();
                vscode.postMessage({
                    type: 'instance'
                });
            } else {
                Flow.configurator?.close();
                this.flowDiagram.instance = null;
                this.flowDiagram.readonly = false; // TODO could be readonly on file system
                this.flowActions.enableCompare(false);
            }
        }
        else {
            (this.options as any)[drawingOption] = !(this.options as any)[drawingOption];
        }
        this.flowDiagram.render(this.options.diagramOptions);
    }

    async onFlowAction(e: FlowActionEvent) {
        const flowAction = e.action;
        let step: flowbee.Step | undefined;
        if (typeof e.target === 'string' && e.target.startsWith('s')) {
            step = this.flowDiagram.flow.steps?.find(step => step.id === e.target);
            if (!step && this.flowDiagram.flow.subflows) {
                // check subflows for target
                for (const subflow of this.flowDiagram.flow.subflows) {
                    step = subflow.steps?.find(step => step.id === e.target);
                    if (step) {
                        e.target = `${subflow.id}.${step.id}`;
                        break;
                    }
                }
            }
        }
        let vals: object | undefined;
        if (e.action === 'run' || e.action === 'values') {
            if (values) {
                vals = await values.prompt(step || this.flowDiagram.flow, e.options?.submit ? 'Submit' : 'Run', e.action !== 'values');
                if (!vals) {
                    return; // canceled or just saved
                }
            }
        }
        vscode.postMessage({
            type: flowAction,
            flow: this.flowDiagram.flow.path,
            ...(e.target) && { target: e.target },
            ...(e.options) && { options: e.options },
            ...(vals) && { values: vals }
        });
    }

    /**
     * Save the flow diagram.
     */
    updateFlow() {
        const indent = this.options.indent;
        const text = this.options.yaml ? this.flowDiagram.toYaml(indent) : this.flowDiagram.toJson(indent);
        vscode.postMessage({
            type: 'change',
            text
        });
        vscode.setState({
            base: this.base,
            file: this.file,
            text,
            readonly: this.flowDiagram.readonly
        });
    }
}

// let flow: Flow | undefined = undefined;

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
        const mode = message.instance ? 'runtime' : 'select';
        const flow = new Flow(message.base, message.websocketPort, text, message.file, mode);
        flow.flowDiagram.instance = message.instance;
        flow.flowActions.enableCompare(!!flow.flowDiagram.instance);
        flow.flowDiagram.readonly = message.readonly || mode === 'runtime';
        flow.render();
        if (isNew) {
            console.debug(`Saving new flow: ${message.file}`);
            flow.updateFlow();
        }
        // save state
        const { base, websocketPort, file, readonly, instance } = message;
        vscode.setState({ base, websocketPort, file, text, readonly, instance, mode, values: values?.defaults });
        if (message.select) {
            let id = message.select;
            const dot = id.indexOf('.');
            if (dot > 0) {
                id = id.substring(dot + 1);
            }
            flow.flowDiagram.select(id, true);
        }
    } else if (message.type === 'theme-change') {
        updateFromState();
    } else if (message.type === 'values') {
        const theme = document.body.className.endsWith('vscode-dark') ? 'dark': 'light';
        const iconBase = `${message.base}/icons/${theme}`;
        const path = `${message.flowPath}`;
        values = new Values(path, iconBase, message.values);
        vscode.setState({ ...vscode.getState(), values: message.values });
    } else if (message.type === 'confirm') {
        evt.emit({ result: message.result });
    }
});

function updateFromState() {
    const state = vscode.getState();
    if (state) {
        templates = new Templates(state.base);
        const flow = new Flow(state.base, state.websocketPort, state.text, state.file, state.mode);
        flow.flowDiagram.readonly = state.readonly;
        flow.flowDiagram.instance = state.instance;
        flow.flowActions.enableCompare(!!flow.flowDiagram.instance);
        flow.render();
        if (state.values) {
            values = new Values(state.file, flow.options.iconBase, state.values);
        }
    }
}

updateFromState();

