import * as flowbee from 'flowbee/dist/nostyles';
import { Options } from './options';
import { Templates } from './templates';
import { FlowActionEvent } from './actions';

export class MenuProvider extends flowbee.DefaultMenuProvider {

    private _onFlowAction = new flowbee.TypedEvent<FlowActionEvent>();
    onFlowAction(listener: flowbee.Listener<FlowActionEvent>) {
        this._onFlowAction.on(listener);
    }

    constructor(
        flowDiagram: flowbee.FlowDiagram,
        private configurator: flowbee.Configurator,
        private templates: Templates,
        private options: Options
    ) {
        super(flowDiagram);
    }

    getItems(flowElementEvent: flowbee.FlowElementEvent): (flowbee.MenuItem | 'separator')[] | undefined {
        const element = flowElementEvent.element;
        const type = element.type;
        let step: flowbee.Step | undefined;
        if (type === 'step') {
            step = element as flowbee.Step;
        }
        let items = super.getItems(flowElementEvent) || [];
        let designItems: flowbee.MenuItem[] = [
            { id: 'expected', label: 'Expected Results', icon: 'open-file.svg' },
            { id: 'submit', label: 'Submit', icon: 'submit.svg' },
            { id: 'run', label: 'Run', icon: 'start.svg' }
        ];
        if (!flowElementEvent.instances) {
            designItems = [
                { id: 'configure', label: 'Configure' },
                ...designItems
            ];
        }

        const isMac = navigator.platform.startsWith('Mac');
        let stroke;
        if (isMac === true) {
            stroke = '⌘';
        }
        else {
            stroke = 'Ctrl';
        }

        items = [
            ...designItems,
            'separator',
            ...items,
            { id: 'cut', label: 'Cut', key: stroke + ' X'},
            { id: 'copy', label: 'Copy', key: stroke + ' C'},
            { id: 'paste', label: 'Paste', key: stroke + ' V'}
        ];
        if (flowElementEvent.instances) {
            const hasCompare = type === 'flow' || step?.path === 'request' && !step.attributes?.submit;
            items = [
                { id: 'inspect', label: 'Inspect' },
                ...(hasCompare ? [{ id: 'compare', label: 'Compare Results', icon: type === 'flow' ? 'fdiff.svg' : 'diff.svg' }] : []),
                'separator',
                ...items
            ];
        }
        return items;
    }

    async onSelectItem(selectEvent: flowbee.ContextMenuSelectEvent): Promise<boolean> {
        if (super.onSelectItem(selectEvent)) {
            return true;
        } else if (selectEvent.item.id === 'configure') {
            if (selectEvent.element) {
                const template = (await this.templates.get(selectEvent.element, 'config')) || '{}';
                this.configurator.render(selectEvent.element, [], template, this.options.configuratorOptions);
            }
            return true;
        } else if (selectEvent.item.id === 'inspect') {
            const elementOrPath = (selectEvent.element as any).path === 'request' ? selectEvent.element : 'default.yaml';
            const instances = selectEvent.instances || [];
            const instance: any = instances.length > 0 ? instances[instances.length - 1] : null;
            let template = '{}';
            if (instance) {
                template = (await this.templates.get(elementOrPath, 'inspect')) || '{}';
                if (instance.data?.request) {
                    instance.request = instance.data.request;
                    if (instance.data.response) {
                        instance.response = instance.data.response;
                    }
                }
            }
            this.configurator.render(selectEvent.element, instances, template, this.options.configuratorOptions);
            return true;
        } else if (selectEvent.item.id === 'run' || selectEvent.item.id === 'submit') {
            // TODO target in subflow
            const target = selectEvent.element.type === 'flow' ? null : selectEvent.element.id;
            const options = selectEvent.item.id === 'submit' ? { submit: true } : null;
            this._onFlowAction.emit({ action: 'run', target, options });
            return true;
        } else if (selectEvent.item.id === 'expected' || selectEvent.item.id === 'compare') {
            // TODO target in subflow
            const target = selectEvent.element.type === 'flow' ? null : selectEvent.element.id;
            this._onFlowAction.emit({ action: selectEvent.item.id, target });
            return true;
        }
        else {
            return false;
        }
    }
}