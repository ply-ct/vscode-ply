import * as flowbee from 'flowbee/dist/nostyles';
import { Options } from './options';
import { Templates } from './templates';

export class MenuProvider extends flowbee.DefaultMenuProvider {

    constructor(
        flowDiagram: flowbee.FlowDiagram,
        private configurator: flowbee.Configurator,
        private templates: Templates,
        private options: Options
    ) {
        super(flowDiagram);
    }

    getItems(flowElementEvent: flowbee.FlowElementEvent): (flowbee.MenuItem | 'separator')[] | undefined {
        let items = super.getItems(flowElementEvent) || [];
        items = [
            { id: 'configure', label: 'Configure' },
            { id: 'expected', label: 'Expected Results' },
            'separator',
            ...items
        ];
        return items;
    }

    async onSelectItem(selectEvent: flowbee.ContextMenuSelectEvent): Promise<boolean> {
        if (super.onSelectItem(selectEvent)) {
            return true;
        } else if (selectEvent.item.id === 'configure') {
            if (selectEvent.element) {
                const template = (await this.templates.get(selectEvent.element)) || '{}';
                this.configurator.render(selectEvent.element, template, this.options.configuratorOptions);
            }
            return true;
        } else {
            return false;
        }
    }
}