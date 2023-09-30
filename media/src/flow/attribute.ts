import * as flowbee from 'flowbee/dist/nostyles';
import { SubflowSpec } from '@ply-ct/ply-api';
import { resolve } from '@ply-ct/ply-values';

export interface AttributeValueProvider {
    /**
     * Get dynamically-determined default attribute value.
     */
    getDynamicDefault?(
        element: flowbee.FlowElement,
        expr: string
    ): ((element: flowbee.FlowElement) => string) | undefined;

    /**
     * Get options list from flow table attributes
     * TODO other possibilities besides flow attributes
     * (especially attribute from another tab on same step)
     * other types besides tables?
     */
    getDynamicOptions?(
        element: flowbee.FlowElement
    ): ((attribute?: string) => string[]) | undefined;

    stageAttribute?(flowElement: flowbee.FlowElement, attribute: string): string | undefined;
    unstageAttribute?(flowElement: flowbee.FlowElement, attribute: string): string | undefined;
}

export class FlowValueProvider implements AttributeValueProvider {
    constructor(readonly flowData: { getFlow(): flowbee.Flow }) {}

    getDynamicOptions(
        flowElement: flowbee.FlowElement
    ): ((attribute?: string) => string[]) | undefined {
        if (flowElement.type === 'flow') {
            return (attribute) => {
                const attributes = this.flowData.getFlow().attributes;
                if (attributes && attribute) {
                    const attrVal = attributes[attribute];
                    if (attrVal) {
                        if (attrVal.startsWith('[[') && attrVal.endsWith(']]')) {
                            return JSON.parse(attrVal).map((row: string[]) => row[0]);
                        }
                    }
                }
                return [];
            };
        }
    }
}

export class LinkValueProvider implements AttributeValueProvider {
    /**
     * Link waypoints
     */
    getDynamicDefault(
        flowElement: flowbee.FlowElement,
        expr: string
    ): ((element: flowbee.FlowElement) => string) | undefined {
        if (flowElement.type === 'link' && expr.startsWith('${display.')) {
            return (element) => {
                if (element.attributes?.display) {
                    return resolve(
                        expr,
                        {
                            ...flowElement.attributes,
                            display: flowbee.LinkLayout.fromAttr(element.attributes.display)
                        },
                        false,
                        console
                    );
                }
                return '';
            };
        }
    }
}

export class SubflowValueProvider implements AttributeValueProvider {
    constructor(readonly subflowData: { getSubflows(): SubflowSpec[] }) {}

    getSubflow(flowElement: flowbee.FlowElement): SubflowSpec | undefined {
        return this.subflowData.getSubflows().find((sf) => sf.stepId === flowElement.id);
    }

    stageAttribute(flowElement: flowbee.FlowElement, attribute: string): string | undefined {
        if (
            flowElement.type === 'step' &&
            flowElement.path?.endsWith('subflow') &&
            flowElement.attributes &&
            attribute
        ) {
            const subflow = this.getSubflow(flowElement);
            if (subflow?.values && attribute === 'inValues') {
                const rows: string[][] = subflow.values.map((v) => [v.name, '']);
                const vals: string[][] = JSON.parse(flowElement.attributes[attribute] || '[]');
                for (const row of rows) {
                    const valrow = vals.find((vr) => vr[0] === row[0]);
                    if (valrow?.length && valrow[1]) {
                        row[1] = valrow[1];
                    }
                }
                return JSON.stringify(rows);
            }
            if (subflow?.returns && attribute === 'outValues') {
                const rows: string[][] = subflow.returns.map((v) => [v.name, '']);
                const vals: string[][] = JSON.parse(flowElement.attributes[attribute] || '[]');
                for (const row of rows) {
                    const valrow = vals.find((vr) => vr[0] === row[0]);
                    if (valrow?.length && valrow[1]) {
                        row[1] = valrow[1];
                    }
                }
                return JSON.stringify(rows);
            }
        }
    }

    unstageAttribute(flowElement: flowbee.FlowElement, attribute: string): string | undefined {
        if (
            flowElement.type === 'step' &&
            flowElement.path?.endsWith('subflow') &&
            flowElement.attributes &&
            attribute
        ) {
            if (attribute === 'inValues' || attribute === 'outValues') {
                const attr = flowElement.attributes[attribute];
                if (attr) {
                    const rows = JSON.parse(attr).filter((row: string[]) => row.length && row[1]);
                    return JSON.stringify(rows);
                }
            }
        }
    }
}
