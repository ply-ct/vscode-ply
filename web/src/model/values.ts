import { EvalOptions, ValuesHolder } from '@ply-ct/ply-values';

export interface Values {
    valuesHolders: ValuesHolder[];
    evalOptions: EvalOptions;
    overrides: { [expr: string]: string };
}
