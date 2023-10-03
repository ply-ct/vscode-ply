import { PlyResults } from '@ply-ct/ply-api';
import { EvalOptions, ValuesHolder, Values as PlyValues } from '@ply-ct/ply-values';
import { Flow, Popup, PopupOptions, ValuesOptions } from 'flowbee/dist/nostyles';

export interface Values {
    valuesHolders: ValuesHolder[];
    evalOptions: EvalOptions;
    overrides: { [expr: string]: string };
}

export const getPopupOptions = (): PopupOptions => {
    return {
        title: '',
        theme: document.body.className.endsWith('vscode-dark') ? 'dark' : 'light',
        help: {
            link: 'https://ply-ct.org/ply/topics/values',
            title: 'Values help',
            icon: 'help.svg'
        },
        margins: {
            top: 75,
            right: 50,
            bottom: 75,
            left: 50
        }
    };
};

export const getValuesOptions = (): ValuesOptions => {
    return {
        ...getPopupOptions(),
        title: 'Flow Values',
        actions: [
            {
                name: 'save',
                label: 'Apply Changes'
            },
            {
                name: 'clear',
                label: 'Clear Overrides'
            }
        ],
        abbreviateLocations: true
    };
};

export const getFlowRunValues = (flow: Flow, plyResults?: PlyResults): [PlyValues?, PlyValues?] => {
    const lastRun = plyResults?.runs[0];
    if (lastRun) {
        const startStep = flow.steps?.find((s) => s.path === 'start');
        if (!startStep) {
            throw new Error(`No start step in: ${flow.path}`);
        }
        const startRun = lastRun.testRuns.find((tr) => tr.test === startStep.id);
        const stopStepIds = (flow.steps || []).filter((s) => s.path === 'stop').map((ss) => ss.id);
        const stopRun = lastRun.testRuns.find((tr) => stopStepIds.includes(tr.test));
        return [startRun?.values, stopRun?.values];
    }
    return [];
};

export class RunValuesPopup extends Popup {
    private runValues?: [PlyValues?, PlyValues?];
    private indent = 2;

    constructor(container?: HTMLElement, public iconBase?: string) {
        super(container, iconBase);
    }

    render(spec: {
        options: PopupOptions & { indent: number };
        runValues: [PlyValues?, PlyValues?];
    }) {
        this.runValues = spec.runValues;
        this.indent = spec.options.indent;
        super.render(spec);
    }

    protected renderContent() {
        const split = document.createElement('div') as HTMLDivElement;
        split.className = 'split';

        const left = document.createElement('div') as HTMLDivElement;
        left.className = 'pane pane-left';
        const before = document.createElement('pre') as HTMLPreElement;
        if (this.runValues && this.runValues[0]) {
            before.innerText = JSON.stringify(this.runValues[0], null, this.indent);
        }
        before.className = 'values';
        left.appendChild(before);
        split.appendChild(left);

        const right = document.createElement('div') as HTMLDivElement;
        right.className = 'pane pane-right';
        const after = document.createElement('pre') as HTMLPreElement;
        if (this.runValues && this.runValues[1]) {
            after.innerText = JSON.stringify(this.runValues[1], null, this.indent);
        }
        after.className = 'values';
        right.appendChild(after);
        split.appendChild(right);

        this.content.appendChild(split);
    }
}
