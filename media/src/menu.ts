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
        const type = flowElementEvent.element?.type;
        let items = super.getItems(flowElementEvent) || [];
        let designItems: flowbee.MenuItem[] = [
            { id: 'expected', label: 'Expected Results', icon: 'open-file.svg' },
            { id: 'submit', label: 'Submit', icon: 'submit.svg' }
        ];
        if (!flowElementEvent.instances) {
            designItems = [
                { id: 'configure', label: 'Configure' },
                ...designItems
            ];
        }
        if (type === 'flow') {
            designItems.push({ id: 'run', label: 'Run', icon: 'start.svg' });
        }
        items = [
            ...designItems,
            'separator',
            ...items,
            { id: 'cut', label: 'Cut', key: '⌘ X'},
            { id: 'copy', label: 'Copy', key: '⌘ C'},
            { id: 'paste', label: 'Paste', key: '⌘ V'}
        ];
        if (flowElementEvent.instances) {
            items = [
                { id: 'inspect', label: 'Inspect' },
                { id: 'compare', label: 'Compare Results', icon: type === 'flow' ? 'fdiff.svg' : 'diff.svg' },
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
            const template = (await this.templates.get(elementOrPath, 'inspect')) || '{}';
            const instances = selectEvent.instances || [];
            const instance: any = instances.length > 0 ? instances[instances.length - 1] : null;
            if (instance) {
                // TODO supplement instance data
                if (selectEvent.element.type === 'step') {
                    const step = selectEvent.element as flowbee.Step;
                    if (instance && step.path === 'request') {
                        instance.request = 'xxx';
                        instance.response = 'yyy';
                    }
                }
            }
            this.configurator.render(selectEvent.element, instances, template, this.options.configuratorOptions);
            return true;
        } else if (selectEvent.item.id === 'run') {
            this._onFlowAction.emit({ action: 'run' });
            return true;
        } else {
            return false;
        }
    }
}