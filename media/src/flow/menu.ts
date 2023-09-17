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
        private updateConfigurator: (
            flowElement: flowbee.FlowElement,
            instances: flowbee.FlowElementInstance[],
            doOpen: boolean
        ) => void,
        private templates: Templates,
        private options: Options
    ) {
        super(flowDiagram);
    }

    getItems(
        flowElementEvent: flowbee.FlowElementEvent
    ): (flowbee.MenuItem | 'separator')[] | undefined {
        const element = flowElementEvent.element;
        const type = element.type;
        let step: flowbee.Step | undefined;
        if (type === 'step') {
            step = element as flowbee.Step;
        }
        let designItems: flowbee.MenuItem[] | undefined;
        if (type !== 'link' && this.flowDiagram.mode !== 'connect') {
            const isReq = step?.path.endsWith('request');
            const isSub = step?.path.endsWith('subflow');
            const isCode = step?.path === 'typescript' || step?.path.endsWith('.ts');
            const canRun = type === 'flow' || isReq;
            designItems = [
                { id: 'expected', label: 'Expected Results', icon: 'expected.svg' },
                ...(isReq ? [{ id: 'request', label: 'Open Request', icon: 'open-file.svg' }] : []),
                ...(isSub ? [{ id: 'subflow', label: 'Open Subflow', icon: 'open-file.svg' }] : []),
                ...(isCode ? [{ id: 'source', label: 'Open Source', icon: 'open-file.svg' }] : []),
                ...(canRun ? [{ id: 'submit', label: 'Submit', icon: 'submit.svg' }] : []),
                ...(canRun ? [{ id: 'run', label: 'Run', icon: 'run.svg' }] : [])
            ];
            if (this.flowDiagram.mode === 'select') {
                designItems = [{ id: 'configure', label: 'Configure' }, ...designItems];
            }
        }
        if (type === 'link' && this.flowDiagram.mode === 'select') {
            designItems = [{ id: 'configure', label: 'Configure' }];
        }

        const superItems = super.getItems(flowElementEvent);
        let items: (flowbee.MenuItem | 'separator')[] = [
            ...(designItems || []),
            ...(superItems?.length && designItems?.length
                ? (['separator'] as (flowbee.MenuItem | 'separator')[])
                : []),
            ...(superItems || [])
        ];
        if (flowElementEvent.instances) {
            const hasCompare =
                type === 'flow' || (type === 'step' && step?.attributes?.submit !== 'true');
            items = [
                { id: 'inspect', label: 'Inspect' },
                ...(hasCompare
                    ? [
                          {
                              id: 'compare',
                              label: 'Compare Results',
                              icon: type === 'flow' ? 'fdiff.svg' : 'diff.svg'
                          }
                      ]
                    : []),
                'separator',
                ...items
            ];
        }
        return items;
    }

    async onSelectItem(selectEvent: flowbee.ContextMenuSelectEvent): Promise<boolean> {
        if (selectEvent.item.id === 'configure') {
            if (selectEvent.element) {
                this.updateConfigurator(selectEvent.element, [], true);
            }
            return true;
        } else if (selectEvent.item.id === 'inspect') {
            const instances = selectEvent.instances || [];
            this.updateConfigurator(selectEvent.element, instances, true);
            return true;
        } else if (selectEvent.item.id === 'run' || selectEvent.item.id === 'submit') {
            // TODO target in embedded
            const target = selectEvent.element.type === 'flow' ? null : selectEvent.element.id;
            const options = selectEvent.item.id === 'submit' ? { submit: true } : null;
            this._onFlowAction.emit({ action: 'run', target, options });
            return true;
        } else if (selectEvent.item.id === 'expected' || selectEvent.item.id === 'compare') {
            // TODO target in embedded
            const target = selectEvent.element.type === 'flow' ? null : selectEvent.element.id;
            this._onFlowAction.emit({ action: selectEvent.item.id, target });
            return true;
        } else if (selectEvent.item.id === 'request') {
            const target = selectEvent.element.id;
            this._onFlowAction.emit({ action: 'edit', element: 'request', target });
            return true;
        } else if (selectEvent.item.id === 'subflow') {
            this._onFlowAction.emit({
                action: 'edit',
                element: 'subflow',
                target: selectEvent.element.attributes?.subflow
            });
            return true;
        } else if (selectEvent.item.id === 'source') {
            let path = selectEvent.element.path;
            if (!path?.endsWith('.ts')) {
                path = selectEvent.element.attributes?.tsFile;
            }
            this._onFlowAction.emit({ action: 'edit', element: 'file', target: path });
            return true;
        } else {
            return super.onSelectItem(selectEvent);
        }
    }
}
