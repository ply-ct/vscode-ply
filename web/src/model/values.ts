import { ValueOptions } from 'flowbee';

export interface Values {
    env: { [key: string]: string };
    objects: { [path: string]: object };
    refVals?: object;
    options?: ValueOptions;
}
