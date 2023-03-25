import { ValuesAccess, EnvironmentVariables } from 'flowbee';

class Values {
    private _valuesAccess: ValuesAccess = new ValuesAccess({});
    trusted: boolean = false;

    setObjects(objects: { [path: string]: object }, env: EnvironmentVariables) {
        this._valuesAccess = new ValuesAccess(objects, env);
    }

    get access(): ValuesAccess {
        return this._valuesAccess;
    }
}

export const values = new Values();
