import * as flowbee from 'flowbee/dist/nostyles';
import { PlyRequest as Request, SubflowSpec, PlyResults } from '@ply-ct/ply-api';
import {
    ExpressionHolder,
    expressions,
    isExpression,
    toExpression,
    ValuesAccess,
    resolve
} from '@ply-ct/ply-values';
import * as jsYaml from 'js-yaml';
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
import { getDescriptors } from './descriptors';
import { MenuProvider } from './menu';
import {
    getPopupOptions,
    getValuesOptions,
    RunValuesPopup,
    Values,
    getFlowRunValues
} from './values';
import {
    AttributeValueProvider,
    FlowValueProvider,
    LinkValueProvider,
    SubflowValueProvider
} from './attribute';

const container = document.getElementById('container') as HTMLDivElement;

// @ts-ignore
const vscode = acquireVsCodeApi();
const EOL = navigator.platform.indexOf('Win') > -1 ? '\r\n' : '\n';

let templates: Templates;

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
let valuesPopup: flowbee.ValuesPopup | undefined;
let runValsPopup: RunValuesPopup | undefined;

interface Config {
    customDescriptors?: flowbee.Descriptor[];
    websocketPort: number;
    showSourceTab: boolean;
}

export class Flow implements flowbee.Disposable {
    readonly options: Options;
    readonly flowDiagram: flowbee.FlowDiagram;
    readonly flowActions?: FlowActions;
    private readonly drawingTools?: DrawingTools;
    private readonly toolbox?: flowbee.Toolbox;
    private requestsToolbox?: flowbee.Toolbox;
    private disposables: flowbee.Disposable[] = [];
    static configurator?: flowbee.Configurator;
    values: Values = {
        valuesHolders: [],
        evalOptions: {
            env: {},
            trusted: false,
            refHolder: '__ply_results'
        },
        overrides: {}
    };
    userOverrides = {};
    results?: PlyResults;
    subflows: SubflowSpec[] = [];
    private attributeValueProviders: AttributeValueProvider[] = [
        new FlowValueProvider({ getFlow: () => this.flowDiagram.flow }),
        new LinkValueProvider(),
        new SubflowValueProvider({ getSubflows: () => this.subflows })
    ];

    /**
     * @param readonly file is readonly
     */
    constructor(
        private base: string,
        readonly config: Config,
        text: string,
        private file: string,
        private readonly: boolean
    ) {
        oldFlow?.dispose();
        oldFlow = this;
        const webSocketUrl = `ws://localhost:${config.websocketPort}/websocket`;
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
                if (
                    e.action === 'Select File' ||
                    e.action === 'Select Flow' ||
                    e.action === 'Create File' ||
                    e.action === 'edit_request'
                ) {
                    const step = this.flowDiagram.flow.steps?.find((s) => s.id === e.element.id);
                    let id = step?.id;
                    if (!id && this.flowDiagram.flow.subflows) {
                        for (const subflow of this.flowDiagram.flow.subflows) {
                            id = subflow.steps?.find((s) => s.id === e.element.id)?.id;
                            if (id) {
                                id = `${subflow.id}.${id}`;
                                break;
                            }
                        }
                    }
                    if (e.action === 'Create File') {
                        vscode.postMessage({ type: 'new', element: 'file', target: id });
                    } else if (e.action === 'Select File') {
                        vscode.postMessage({ type: 'select', element: 'file', target: id });
                    } else if (e.action === 'Select Flow') {
                        vscode.postMessage({ type: 'select', element: 'flow', target: id });
                    } else if (e.action === 'edit_request') {
                        const overrides = readState(false)?.userOverrides || {};
                        vscode.postMessage({
                            type: 'edit',
                            element: 'request',
                            target: id,
                            options: { overrides }
                        });
                    }
                } else if (typeof e.action === 'string' && e.element.type === 'step') {
                    if (e.action.endsWith('.ts') || e.element.path?.endsWith('subflow')) {
                        vscode.postMessage({ type: 'edit', element: 'file', path: e.action });
                    }
                } else if (typeof e.action === 'object') {
                    if (e.element.type === 'link') {
                        const disp = flowbee.LinkLayout.fromAttr(e.element.attributes?.display);
                        const from = this.flowDiagram.flow.steps?.find((s) =>
                            s.links?.find((l) => l.id === e.element.id)
                        );
                        const to = this.flowDiagram.flow.steps?.find(
                            (s) => s.id === (e.element as any).to
                        );
                        // TODO from/to in embedded
                        if (from?.attributes?.display && to?.attributes?.display) {
                            const linkLayout = new flowbee.LinkLayout(
                                disp,
                                flowbee.parseDisplay(from)!,
                                flowbee.parseDisplay(to)!
                            );
                            let points: number | undefined;
                            if (e.action.name === 'shape' && typeof e.action.value === 'string') {
                                disp.type = e.action.value;
                            }
                            if (e.action.name === 'points' && typeof e.action.value === 'string') {
                                const pts = parseInt(e.action.value);
                                if (!isNaN(pts)) points = pts;
                            }
                            linkLayout.calcLink(points);
                            linkLayout.calcLabel();
                            e.element.attributes!.display = flowbee.LinkLayout.toAttr(disp);
                            this.updateFlow();
                            this.flowDiagram.render(this.options.diagramOptions);
                        }
                    } else if (e.element.type === 'step') {
                        if (e.action.name === 'subflowInstance' && e.element.attributes?.subflow) {
                            vscode.postMessage({
                                type: 'edit',
                                element: 'flowInstance',
                                path: e.element.attributes.subflow
                            });
                        }
                    }
                } else {
                    if (e.element.attributes) {
                        const attrs = Object.keys(e.element.attributes);
                        for (const attr of attrs) {
                            const unstagedVal = this.getUnstagedAttributeValue(e.element, attr);
                            if (unstagedVal) {
                                e.element.attributes[attr] = unstagedVal;
                            }
                        }
                    }
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
            getDescriptors(this.config.customDescriptors),
            this.options.diagramOptions
        );
        this.disposables.push(this.flowDiagram.onFlowChange((_e) => this.updateFlow()));
        this.disposables.push(
            this.flowDiagram.onFlowElementAdd((onAdd) => {
                if (onAdd.element.type === 'step' && onAdd.descriptor) {
                    // added a step
                    if (onAdd.descriptor.link) {
                        // dragged from requests toolpane
                        const request = requests.find((req) => {
                            return req.link?.url && req.link.url === onAdd.descriptor!.link!.url;
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
                                this.updateFlow();
                            }
                        }
                    }
                    this.updateConfigurator(
                        onAdd.element,
                        undefined,
                        onAdd.descriptor.path === 'request'
                    );
                }
            })
        );

        this.flowDiagram.dialogProvider = new DialogProvider();
        const menuProvider = new MenuProvider(
            this.flowDiagram,
            (flowElement, instances, doOpen) => {
                this.updateConfigurator(flowElement, instances, doOpen);
            },
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
            this.flowDiagram.onFlowElementUpdate(async (flowElemUpdate) => {
                if (Flow.configurator?.flowElement?.id === flowElemUpdate.element.id) {
                    this.updateConfigurator(flowElemUpdate.element);
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
            this.toolbox = new flowbee.Toolbox(
                getDescriptors(this.config.customDescriptors),
                toolboxElement
            );

            // open/close toolbox
            const toolboxHeader = toolboxContainer.querySelector(
                '.toolbox-header'
            ) as HTMLDivElement;
            toolboxHeader.style.cursor = 'pointer';
            const toolboxCaret = flowHeader.querySelector('.toolbox-caret') as HTMLSpanElement;
            toolboxCaret.style.display = 'none';
            toolboxHeader.onclick = (e: MouseEvent) => {
                if ((e.target as any).id !== 'newCustom') {
                    this.setToolboxOpen(false);
                }
            };
            toolboxCaret.onclick = (_e: MouseEvent) => {
                this.setToolboxOpen(true);
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

            // new custom
            const newCustom = document.getElementById('newCustom') as HTMLInputElement;
            newCustom.onclick = (_e: MouseEvent) => {
                toolboxCaret.style.display = 'none';
                toolboxContainer.style.display = 'flex';
                vscode.postMessage({ type: 'new', element: 'custom' });
            };

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
                    if (e.action === 'edit') {
                        if (e.element === 'request') {
                            e.options = { overrides: readState(false)?.userOverrides || {} };
                        } else if (e.element === 'subflow') {
                            e.element = this.flowDiagram.instance ? 'flowInstance' : 'file';
                        }
                    }
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
                this.getConfiguratorOptions(),
                this.getSourceLink(cfgr.flowElement)
            );
            if (cfgr.flowElement.id) {
                this.flowDiagram.select(cfgr.flowElement.id);
            }
        }
        container.style.display = 'flex';
    }

    getConfiguratorOptions(): flowbee.ConfiguratorOptions {
        return {
            ...this.options.configuratorOptions,
            ...(this.config.showSourceTab && { sourceTab: 'yaml' })
        };
    }

    getSourceLink(flowElement: flowbee.FlowElement): flowbee.SourceLink | undefined {
        if (flowElement.path?.endsWith('.ts')) {
            return { path: flowElement.path };
        } else if (flowElement.path === 'typescript' && flowElement.attributes?.tsFile) {
            return { path: flowElement.attributes.tsFile };
        } else if (flowElement.path?.endsWith('request')) {
            let path = this.file;
            let lastSep = path.lastIndexOf('/');
            if (lastSep === -1) lastSep = path.lastIndexOf('\\');
            if (lastSep > 0) path = path.substring(lastSep + 1);
            path += `#${flowElement.id}`;
            return { path, action: 'edit_request' };
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

    findInstances(flowElement: flowbee.FlowElement): flowbee.FlowElementInstance[] | undefined {
        const flowInstance = this.flowDiagram.instance;
        if (flowInstance) {
            const id = flowElement.id;
            if (id?.startsWith('s') && flowInstance.stepInstances) {
                return flowInstance.stepInstances.filter((si) => si.id === id);
            } else if (id?.startsWith('f') && flowInstance.subflowInstances) {
                return flowInstance.subflowInstances.filter((sfi) => sfi.id === id);
            } else {
                return [flowInstance];
            }
        }
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

    updateStep(stepId: string, reqObjOrStepAttr: object | [string, string]) {
        const step = this.findStep(stepId);
        if (step) {
            if (!step.attributes) step.attributes = {};
            if (Array.isArray(reqObjOrStepAttr)) {
                step.attributes[reqObjOrStepAttr[0]] = reqObjOrStepAttr[1];
                this.updateFlow(true);
            } else {
                const reqName = Object.keys(reqObjOrStepAttr)[0];
                step.name = reqName.replace(/_/g, EOL);
                const req = (reqObjOrStepAttr as any)[reqName];
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
    }

    async updateConfigurator(
        flowElement: flowbee.FlowElement,
        instances?: flowbee.FlowElementInstance[],
        doOpen = false,
        position?: { left: number; top: number; width: number; height: number },
        tab?: string
    ) {
        if (Flow.configurator && (doOpen || Flow.configurator?.isOpen)) {
            const template = await templates.getConfigTemplate(
                this.flowDiagram.mode === 'runtime' ? 'inspect' : 'config',
                flowElement
            );
            for (const tab of Object.keys(template)) {
                for (const widget of (template as flowbee.ConfigTemplate)[tab].widgets) {
                    // dynamic defaults
                    const dynamicDefault = this.getDynamicAttributeDefault(flowElement, widget);
                    if (dynamicDefault) widget.default = dynamicDefault;

                    // dynamic options
                    const dynamicOptions = this.getDynamicAttributeOptions(flowElement, widget);
                    if (dynamicOptions) widget.options = dynamicOptions;

                    const stagedVal = this.getStagedAttributeValue(flowElement, widget);
                    if (stagedVal) {
                        if (!flowElement.attributes) flowElement.attributes = {};
                        flowElement.attributes[widget.attribute!] = stagedVal;
                    }
                }
            }
            if (instances && instances.length > 0) {
                const instance = instances[instances.length - 1] as flowbee.StepInstance & {
                    request?: any;
                    response?: any;
                };
                if (instance.data) {
                    if (instance.data.request) {
                        instance.request = instance.data.request;
                        if (typeof instance.request === 'object') {
                            instance.request = jsYaml.dump(instance.request, {
                                indent: this.options.indent
                            });
                        }
                        if (instance.data.response) {
                            instance.response = instance.data.response;
                            if (typeof instance.response === 'object') {
                                instance.response = jsYaml.dump(instance.response, {
                                    indent: this.options.indent
                                });
                            }
                        }
                    } else if (typeof instance.data === 'object') {
                        instance.data = JSON.stringify(instance.data, null, this.options.indent);
                    }
                } else {
                    instance.data = '';
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
                this.getConfiguratorOptions(),
                this.getSourceLink(flowElement),
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
        if (tab) Flow.configurator?.setTab(tab);
    }

    openConfigurator(tab?: string) {
        if (valuesPopup?.isOpen) {
            valuesPopup.close();
        }
        if (Flow.configurator) {
            this.updateConfigurator(
                this.flowDiagram.flow,
                this.flowDiagram.instance ? [this.flowDiagram.instance] : [],
                !Flow.configurator.isOpen,
                undefined,
                tab
            );
        }
    }

    closeConfigurator() {
        Flow.configurator?.close();
        updateState({ configurator: { open: false } });
    }

    setToolboxOpen(open: boolean) {
        const toolboxContainer = document.getElementById('toolbox-container') as HTMLDivElement;
        const flowHeader = document.querySelector('.flow-header') as HTMLDivElement;
        const toolboxCaret = flowHeader.querySelector('.toolbox-caret') as HTMLSpanElement;
        if (open) {
            toolboxCaret.style.display = 'none';
            toolboxContainer.style.display = 'flex';
        } else {
            toolboxContainer.style.display = 'none';
            toolboxCaret.style.display = 'inline-block';
        }
    }

    getDynamicAttributeDefault(
        flowElement: flowbee.FlowElement,
        widget: flowbee.Widget
    ): ((element: flowbee.FlowElement) => string) | undefined {
        if (typeof widget.default === 'object') {
            const defaultObj = widget.default;
            const expr = '${' + Object.keys(defaultObj)[0] + '}';
            for (const avp of this.attributeValueProviders) {
                const defaultFn = avp.getDynamicDefault?.(flowElement, expr);
                if (defaultFn) return defaultFn;
            }
            return (element) => {
                if (element.attributes) {
                    return resolve(expr, element.attributes, false, console);
                }
                return defaultObj[expr];
            };
        }
    }

    getDynamicAttributeOptions(
        flowElement: flowbee.FlowElement,
        widget: flowbee.Widget
    ): ((attribute?: string) => string[]) | undefined {
        if (typeof widget.options === 'string') {
            for (const avp of this.attributeValueProviders) {
                const optsFn = avp.getDynamicOptions?.(flowElement);
                if (optsFn) return optsFn;
            }
        }
    }

    getStagedAttributeValue(
        flowElement: flowbee.FlowElement,
        widget: flowbee.Widget
    ): string | undefined {
        if (flowElement.attributes && widget.attribute) {
            for (const avp of this.attributeValueProviders) {
                const stagedVal = avp.stageAttribute?.(flowElement, widget.attribute);
                if (stagedVal) return stagedVal;
            }
        }
    }

    getUnstagedAttributeValue(
        flowElement: flowbee.FlowElement,
        attribute?: string
    ): string | undefined {
        if (flowElement.attributes && attribute) {
            for (const avp of this.attributeValueProviders) {
                const unstagedVal = avp.unstageAttribute?.(flowElement, attribute);
                if (unstagedVal) return unstagedVal;
            }
        }
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
                        e.target = `${subflow.id}-${step.id}`;
                        break;
                    }
                }
            }
        }

        if (flowAction === 'toolbox') {
            readState()?.setToolboxOpen(e.options?.state === 'open');
        } else if (flowAction === 'configurator') {
            if (e.options?.state === 'open') {
                if (e.options.mode) {
                    updateState({ mode: e.options.mode, selected: this.flowDiagram.flow });
                    this.switchMode(e.options.mode);
                    const flow = readState(e.options.mode === 'inspect');
                    flow?.openConfigurator(e.options.tab);
                } else {
                    if (this.flowDiagram.mode !== 'runtime') {
                        const sel = this.flowDiagram.selected.length
                            ? this.flowDiagram.selected[0]
                            : this.flowDiagram.flow;
                        this.updateConfigurator(sel, undefined, true);
                    }
                }
            } else {
                readState()?.closeConfigurator();
            }
        } else if (flowAction === 'values') {
            this.openValuesPopup();
        } else {
            if (flowAction === 'run') {
                this.closeConfigurator();
            }
            vscode.postMessage({
                type: flowAction,
                flow: this.flowDiagram.flow.path,
                ...(e.element && { element: e.element }),
                ...(e.target && { target: e.target }),
                ...(e.options && { options: e.options })
            });
        }
    }

    openValuesPopup() {
        this.closeConfigurator();
        if (this.flowDiagram.mode === 'runtime') {
            const runValues = getFlowRunValues(this.flowDiagram.flow, this.results);
            if (!runValsPopup) {
                const container = document.getElementById('flow-container') as HTMLDivElement;
                runValsPopup = new RunValuesPopup(container, this.options.iconBase);
            }
            runValsPopup.iconBase = this.options.iconBase;
            runValsPopup.render({
                options: { ...getPopupOptions(), title: 'Flow Run Values', indent: 2 },
                runValues
            });
        } else {
            if (!valuesPopup) {
                const container = document.getElementById('flow-container') as HTMLDivElement;
                valuesPopup = new flowbee.ValuesPopup(container, this.options.iconBase);
                valuesPopup.onPopupAction((actionEvent) => this.onValuesAction(actionEvent));
                valuesPopup.onOpenValues((openValuesEvent) => {
                    vscode.postMessage({
                        type: 'edit',
                        element: 'file',
                        path: openValuesEvent.path
                    });
                });
            }
            valuesPopup.iconBase = this.options.iconBase;
            valuesPopup.render({ values: this.getUserValues(), options: getValuesOptions() });
            valuesPopup.setDecorator((text: string) => {
                if (text && isExpression(text)) {
                    const required = this.getRequiredValueNames()
                        .map((v) => toExpression(v))
                        .includes(text);
                    const userVals = this.getUserValues();
                    const override = userVals.overrides ? userVals.overrides[text] : '';
                    const value =
                        override || userVals.values.find((v) => v.expression === text)?.value;
                    const exprClass = value ? 'expression' : 'unresolved';
                    return [
                        {
                            range: { line: 0, start: 0, end: text.length - 1 },
                            className: required ? `${exprClass} required` : exprClass
                        }
                    ];
                }
                return [];
            });
        }
    }

    /**
     * Update the flow diagram document.
     */
    updateFlow(post = true) {
        const indent = this.options.indent;
        const text = this.options.yaml
            ? this.flowDiagram.toYaml({ indent })
            : this.flowDiagram.toJson({ indent });

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
            config: this.config,
            readonly: this.flowDiagram.readonly,
            mode: 'select'
        });
    }

    onValuesAction(valuesAction: flowbee.ValuesActionEvent) {
        if (valuesAction.action === 'save') {
            this.userOverrides = valuesPopup?.getValues()?.overrides || {};
            updateState({ userOverrides: this.userOverrides });
            vscode.postMessage({ type: 'save-values', overrides: this.userOverrides });
            valuesPopup?.close();
        } else if (valuesAction.action === 'clear') {
            this.userOverrides = {};
            valuesPopup?.clear();
            vscode.postMessage({ type: 'save-values', overrides: {} });
        } else if (valuesAction.action === 'close') {
            valuesPopup?.close();
        }
    }

    getUserValues(): flowbee.UserValues {
        const flow = readState();
        if (flow) {
            const values = flow.values || {};
            const valuesAccess = new ValuesAccess(values.valuesHolders, {
                ...values.evalOptions,
                logger: console
            });
            const holder: ExpressionHolder = {
                ...flow.flowDiagram.flow,
                name: this.file
            } as ExpressionHolder;
            const exprVals: flowbee.ExpressionValue[] = expressions(holder).map((expr) => {
                const locatedValue = valuesAccess.getValue(expr);
                return {
                    expression: expr,
                    value: locatedValue?.value,
                    location: locatedValue?.location?.path
                };
            });
            return { values: exprVals, overrides: flow.userOverrides };
        } else {
            return { values: [], overrides: {} };
        }
    }

    getRequiredValueNames(): string[] {
        const flowValues = this.flowDiagram.flow.attributes?.values;
        if (flowValues) {
            const rows = JSON.parse(flowValues) as string[][];
            return rows.filter((row) => row[2] === 'true').map((r) => r[0]);
        }
        return [];
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
            templates = new Templates(message.base, message.config.customDescriptors);
        }
        let text = message.text?.trim();
        let isNew = false;
        if (!text) {
            // new flow
            isNew = true;
            text = await templates.get('default.flow');
        }
        const flow = new Flow(message.base, message.config, text, message.file, message.readonly);
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
            config: message.config
        });
    } else if (message.type === 'select') {
        const flow = readState(false);
        if (flow) {
            flow.closeConfigurator(); // TODO update configurator
            let id = message.target;
            const dot = id.indexOf('.');
            if (dot > 0) {
                id = id.substring(dot + 1);
            }
            flow.flowDiagram.select(id);
        }
    } else if (message.type === 'instance') {
        const flow = readState(false);
        if (flow) {
            flow.flowDiagram.instance = message.instance;
            const hasInstance = !!flow.flowDiagram.instance;
            flow.flowActions?.setRunning(hasInstance && message.event === 'start');
            if (hasInstance) {
                flow.results = message.results;
                flow.flowDiagram.readonly = true;
                flow.switchMode('runtime');
                updateState({ mode: 'runtime', results: flow.results });
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
    } else if (message.type === 'subflows') {
        const flow = readState(false);
        if (flow) {
            flow.subflows = message.subflows;
        }
        updateState({ subflows: message.subflows });
    } else if (message.type === 'step') {
        const flow = readState(false);
        if (flow) {
            if (message.reqObj) {
                flow.updateStep(message.stepId, message.reqObj);
            } else {
                flow.updateStep(message.stepId, [
                    message.flow ? 'subflow' : 'tsFile',
                    message.flow || message.file
                ]);
            }
        }
    } else if (message.type === 'values') {
        const values = {
            valuesHolders: message.holders,
            evalOptions: message.options,
            overrides: message.overrides
        };
        updateState({ values, userOverrides: values.overrides });
    } else if (message.type === 'action') {
        readState(
            !message.options ||
                (message.options.mode !== 'select' && message.options.mode !== 'connect')
        )?.onFlowAction({
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
        const flow = readState();
        if (flow && (valuesPopup?.isOpen || runValsPopup?.isOpen)) {
            flow.openValuesPopup();
        }
    } else if (message.type === 'confirm') {
        dlgEvt.emit({ result: message.result });
    }
});

interface FlowState {
    base?: string;
    file?: string;
    text?: string;
    readonly?: boolean; // this means the file is readonly
    mode?: flowbee.Mode;
    config?: Config;
    selected?: {
        id?: string; // selected but no id means flow selected
        instances?: flowbee.FlowElementInstance[];
    };
    configurator?: {
        open: boolean;
        position?: { left: number; top: number; width: number; height: number };
    };
    values?: Values;
    userOverrides?: { [expr: string]: string };
    storeVals?: any;
    results?: PlyResults;
    requests?: flowbee.Descriptor[];
    subflows?: SubflowSpec[];
}

function updateState(delta: FlowState) {
    vscode.setState({ ...vscode.getState(), ...delta });
}

function readState(loadInstance = true): Flow | undefined {
    const state = vscode.getState();
    if (state && state.base && state.file) {
        templates = new Templates(state.base, state.config.customDescriptors);
        const flow = new Flow(state.base, state.config, state.text, state.file, state.readonly);
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
        flow.results = state.results;
        flow.subflows = state.subflows || [];
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
        if (state.values) flow.values = state.values;
        if (state.userOverrides) flow.userOverrides = state.userOverrides;
        return flow;
    }
}

if (vscode.getState()?.ready) {
    readState();
} else {
    vscode.postMessage({ type: 'ready' });
    vscode.setState({ ...vscode.getState(), ready: true });
}
