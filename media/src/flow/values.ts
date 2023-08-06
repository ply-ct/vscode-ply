import { EvalOptions, ValuesHolder } from '@ply-ct/ply-values';
import { ValuesOptions } from 'flowbee';

export interface Values {
    valuesHolders: ValuesHolder[];
    evalOptions: EvalOptions;
    overrides: { [expr: string]: string };
}

export const getValuesOptions = (): ValuesOptions => {
    return {
        title: 'Flow Values',
        theme: document.body.className.endsWith('vscode-dark') ? 'dark' : 'light',
        help: {
            link: 'https://ply-ct.org/ply/topics/values',
            title: 'Values help',
            icon: 'help.svg'
        },
        actions: [
            {
                name: 'save',
                label: 'Apply'
            },
            {
                name: 'clear',
                label: 'Clear'
            }
        ],
        margins: {
            top: 75,
            right: 50,
            bottom: 75,
            left: 50
        }
    };
};
