import * as flowbee from 'flowbee/dist/nostyles';

export class Values {

    values: any;

    constructor(plyValues: object, flow: flowbee.Flow
    ) {
        this.values = plyValues;
        if (flow.attributes?.values) {
            const rows = JSON.parse(flow.attributes?.values);
            for (const row of rows) {
                this.values[row[0]] = row[1];
            }
        }
    }

    getNeeded(step: flowbee.Step): {[key: string]: string} | undefined {
        if (step.path === 'request') {
            let expressions: string[] = [];
            if (step.attributes) {
                for (const value of Object.values(step.attributes)) {
                    const exprs = this.getExpressions(value);
                    if (exprs) {
                        expressions = [ ...expressions, ...exprs ];
                    }
                }
            }

            if (expressions.length > 0) {
                const needed: {[key: string]: string} = {};
                for (const expression of expressions) {
                    // TODO populate from plyValues
                    const res = this.get(expression, this.values);
                    needed[expression] = res === expression ? '' : res || '';
                }
                return needed;
            }
        }
    }

    private getExpressions(content: string): string[] | null {
        return content.match(/\$\{.+?}/g);
    }

    /**
     * TODO: duplicated from ply/src/subst.ts
     */
    get(input: string, context: object): string {

        if (input.startsWith('${~')) {
            return input; // ignore regex
        }

        // escape all \
        let path = input.replace(/\\/g, '\\\\');
        // trim ${ and }
        path = path.substring(2, path.length - 1);
        if (path.startsWith('@')) {
            path = '__ply_results.' + path.substring(1);
        }

        console.log("EVALUATING: " + path);

        let res: any = context;
        for (let seg of path.split('.')) {
            const idx = seg.search(/\[.+?]$/);
            let indexer;
            if (idx > 0) {
                indexer = seg.substring(idx + 1, seg.length - 1);
                seg = seg.substring(0, idx);
            }
            if (!res[seg]) { return input; }
            res = res[seg];
            if (indexer) {
                if ((indexer.startsWith("'") || indexer.startsWith('"')) &&
                (indexer.endsWith("'") || indexer.endsWith('"'))) {
                    res = res[indexer.substring(1, indexer.length - 1)];  // object property
                } else {
                    res = res[parseInt(indexer)]; // array index
                }
            }
        }

        return '' + res;
    }
}