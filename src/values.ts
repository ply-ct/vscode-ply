import { Retrieval } from 'ply-ct';

export class PlyValues {

    constructor(readonly baseLoc: string) {
    }

    async loadValues(path: string): Promise<object> {
        const retrieval = new Retrieval(path);
        const contents = await retrieval.read();
        return contents ? JSON.parse(contents) : {};
    }

    // TODO baseLoc and files are hardcoded
    async getValues(): Promise<object> {
        var values = {};
        let valuesLoc = this.baseLoc + '/values/';
        values = Object.assign(values, await this.loadValues(valuesLoc + 'localhost.values.json'));
        // values = Object.assign(values, await this.loadValues(valuesLoc + 'ply-ct.com.values.json'));
        // values = Object.assign(values, await this.loadValues(valuesLoc + 'main.values.json'));
        // values = Object.assign(values, await this.loadValues(valuesLoc + 'auth.values.json'));
        return values;
    }
}
