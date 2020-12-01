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

// @ts-ignore
const vscode = acquireVsCodeApi();

let templates: Templates;

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

export class Flow {

    readonly options: Options;
    readonly flowDiagram: flowbee.FlowDiagram;
    readonly toolbox?: flowbee.Toolbox;
    static configurator?: flowbee.Configurator;

    constructor(private base: string, websocketPort: number, text: string, private file: string) {
        const webSocketUrl = `ws://localhost:${websocketPort}/websocket`;
        this.options = new Options(base, webSocketUrl);
        this.options.theme = document.body.className.endsWith('vscode-light') ? 'light': 'dark';

        // configurator
        if (!Flow.configurator) {
            // TODO dispose listener
            Flow.configurator = new flowbee.Configurator();
            Flow.configurator.onFlowElementUpdate(_e => this.updateFlow());
        }

        // theme-based icons
        for (const toolIcon of document.querySelectorAll('input[type=image]')) {
            if (!toolIcon.getAttribute('src') && toolIcon.hasAttribute('data-icon')) {
                const icon = toolIcon.getAttribute('data-icon') as string;
                toolIcon.setAttribute('src', `${this.options.iconBase}/${icon}`);
            }
        }

        // diagram
        const canvasElement = document.getElementById('diagram-canvas') as HTMLCanvasElement;
        this.flowDiagram = new flowbee.FlowDiagram(text, canvasElement, file, descriptors);
        this.flowDiagram.onFlowChange(_e => this.updateFlow());
        this.flowDiagram.dialogProvider = new DialogProvider();
        this.flowDiagram.contextMenuProvider = new MenuProvider(this.flowDiagram, Flow.configurator, templates, this.options);
        this.flowDiagram.onFlowElementSelect(async flowElementSelect => {
            if (Flow.configurator?.isOpen) {
                const flowElement = flowElementSelect.element || this.flowDiagram.flow;
                const template = await templates.get(flowElement, 'config');
                Flow.configurator.render(flowElement, flowElementSelect.instances || [], template, this.options.configuratorOptions);
            }
        });
        this.flowDiagram.onFlowElementUpdate(async flowElementUpdate => {
            const flowElement = flowElementUpdate.element;
            if (Flow.configurator?.isOpen && Flow.configurator.flowElement?.id === flowElement.id) {
                const template = await templates.get(flowElement, 'config');
                Flow.configurator.render(flowElement, [], template, this.options.configuratorOptions);
            }
        });

        // toolbox
        const toolboxElement = document.getElementById('flow-toolbox') as HTMLDivElement;
        // instantiated twice if left open then restart -- avoid dup toolbox
        const flowbeeToolboxElement = toolboxElement.querySelector('.flowbee-toolbox');
        if (!flowbeeToolboxElement) {
            this.toolbox = new flowbee.Toolbox(descriptors, toolboxElement);
        }

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
        const drawingTools = new DrawingTools(document.getElementById('diagram-tools') as HTMLDivElement);
        drawingTools.onOptionToggle(e => this.onOptionToggle(e));
        drawingTools.onZoomChange((e: ZoomChangeEvent) => {
            this.flowDiagram.zoom = e.zoom;
        });
        const flowActions = new FlowActions(document.getElementById('flow-actions') as HTMLDivElement);
        flowActions.onFlowAction(e => this.onFlowAction(e));
    }

    render() {
        this.flowDiagram.render(this.options.diagramOptions);
        this.toolbox?.render(this.options.toolboxOptions);
    }

    onOptionToggle(e: OptionToggleEvent) {
        const drawingOption = e.option;
        if (drawingOption === 'mode') {
            this.options.mode = this.options.mode === 'select' ? 'connect' : 'select';
            (document.getElementById('select') as HTMLElement).classList.toggle('unselected');
            (document.getElementById('connect') as HTMLElement).classList.toggle('unselected');
            this.flowDiagram.mode = this.options.mode;
        } else {
            (document.getElementById(`${drawingOption}`) as HTMLInputElement).classList.toggle('unselected');
            (this.options as any)[drawingOption] = !(this.options as any)[drawingOption];
            if (this.flowDiagram) {
                this.flowDiagram.render(this.options.diagramOptions);
            }
        }
    }

    onFlowAction(e: FlowActionEvent) {
        const flowAction = e.action;
        vscode.postMessage({
            type: flowAction,
            flow: this.flowDiagram.flow.path
        });
    }

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

window.addEventListener('message', async (event) => {
    const message = event.data; // json message data from extension
    console.debug(`message: ${JSON.stringify(message, null, 2)}`);
    if (message.type === 'update') {
        if (!templates) {
            templates = new Templates(message.base);
        }
        const text = message.text?.trim() || (await templates.get('default.flow'));
        const flow = new Flow(message.base, message.websocketPort, text, message.file);
        flow.flowDiagram.readonly = message.readonly;
        flow.flowDiagram.instance = message.instance;
        flow.render();
        // save state
        const { base, websocketPort, file, readonly, instance } = message;
        vscode.setState({ base, websocketPort, file, text, readonly, instance });
    } else if (message.type === 'confirm') {
        evt.emit({ result: message.result });
    }
});

const state = vscode.getState();
if (state) {
    templates = new Templates(state.base);
    const flow = new Flow(state.base, state.websocketPort, state.text, state.file);
    flow.flowDiagram.readonly = state.readonly;
    flow.flowDiagram.instance = state.instance;
    flow.render();
}

