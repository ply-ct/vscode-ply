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

    getItems(flowElementEvent: flowbee.FlowElementEvent): flowbee.MenuItem[] | undefined {
        let items = super.getItems(flowElementEvent) || [];
        if (flowElementEvent.element) {
            items = [
                ...items,
                { id: 'configure', label: 'Configure' },
                { id: 'expected', label: 'Expected Results' }
            ];
        }
        return items;
    }

    async onSelectItem(selectEvent: flowbee.ContextMenuSelectEvent): Promise<boolean> {
        if (super.onSelectItem(selectEvent)) {
            return true;
        } else if (selectEvent.item.id === 'configure') {
            if (selectEvent.element) {
                // TODO general templates
                let template = '{}';
                if (selectEvent.element.type === 'step' && (selectEvent.element as flowbee.Step).path === 'request.ts') {
                    template = await this.templates.get('request.yaml');
                }
                this.configurator.render(selectEvent.element, template, this.options.configuratorOptions);
            }
            return true;
        } else {
            return false;
        }
    }
}