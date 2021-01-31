import * as flowbee from 'flowbee/dist/nostyles';

export class Values {

    constructor(readonly iconBase: string, readonly defaults: object) {
    }

    async promptIfNeeded(flowOrStep: flowbee.Flow | flowbee.Step, action: string): Promise<{[key: string]: string} | undefined> {
        let needed: {[key: string]: string};
        let name: string;
        if (flowOrStep.type === 'step') {
            const step = flowOrStep as flowbee.Step;
            needed = this.getNeeded(step) || {};
            name = step.name.replace(/\r?\n/g, ' ');
        } else {
            needed = {};
            const flow = flowOrStep as flowbee.Flow;
            if (flow.steps) {
                for (const step of flow.steps) {
                    needed = { ...needed, ...this.getNeeded(step) };
                }
            }
            if (flow.subflows) {
                for (const subflow of flow.subflows) {
                    if (subflow.steps) {
                        for (const step of subflow.steps) {
                            needed = { ...needed, ...this.getNeeded(step) };
                        }
                    }
                }
            }
            name = flowbee.getFlowName(flow);
        }
        if (Object.keys(needed).length > 0) {
            const title = `Values for '${name}'`;
            const val = await this.renderTable(title, action, this.toString(needed));
            if (val) {
                return this.fromString(val);
            }
        }
        return needed;
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
                    const res = this.get(expression, this.defaults);
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
     * duplicated from ply/src/subst.ts
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

    toString(values: {[key: string]: string}): string {
        const keys = Object.keys(values);
        if (keys.length === 0) {
            return '';
        } else {
            const rows = [];
            for (const key of keys) {
                rows.push([ key, values[key] ]);
            }
            return JSON.stringify(rows);
        }
    }

    fromString(value: string): {[key: string]: string} | undefined {
        if (value) {
            const val: any = {};
            const rows = JSON.parse(value);
            for (const row of rows) {
                let key = row[0].substring(2, row[0].length - 1); // trim expr tokens
                if (key.startsWith('@')) {
                    key = `__ply_results.${key.substring(1)}`;
                }
                val[key] = row[1];
            }
            return val;
        }
    }

    renderTable(title: string, action: string, initialValue?: string): Promise<string | void> {
        return new Promise<string | void>(resolve => {
            // build html
            const div = document.getElementById('flow-values') as HTMLDivElement;
            const theme = document.body.className.endsWith('vscode-light') ? 'light': 'dark';
            div.className = `flowbee-configurator-${theme} flow-values`;
            const header = document.createElement('div') as HTMLDivElement;
            header.className = 'flowbee-config-header';
            const titleElem = document.createElement('div') as HTMLDivElement;
            titleElem.className = 'flowbee-config-title';
            titleElem.innerText = title;
            header.appendChild(titleElem);
            const close = document.createElement('div') as HTMLDivElement;
            close.className = 'flowbee-config-close';
            close.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve();
            };
            const closeImg = document.createElement('input') as HTMLInputElement;
            closeImg.type = 'image';
            closeImg.alt = closeImg.title = 'Close';
            closeImg.src = `${this.iconBase}/close.svg`;
            close.appendChild(closeImg);
            header.appendChild(close);
            div.appendChild(header);
            const content = document.createElement('div') as HTMLDivElement;
            content.className = 'flowbee-config-content flow-values-content';
            const tableContent = document.createElement('div') as HTMLDivElement;
            tableContent.className = 'flowbee-config-tab-content';
            content.appendChild(tableContent);
            let value = initialValue || '';
            const table = new flowbee.Table(
                [ { type: 'text', label: 'Expression' }, { type: 'text', label: 'Value' } ],
                value,
                false
            );
            table.onTableUpdate(updateEvent => value = updateEvent.value);
            tableContent.appendChild(table.tableElement);
            div.appendChild(content);
            const footer = document.createElement('div') as HTMLDivElement;
            footer.className = 'flowbee-config-footer';
            const okButton = document.createElement('input') as HTMLInputElement;
            okButton.type = 'button';
            okButton.value = action;
            okButton.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve(value);
            };
            footer.appendChild(okButton);
            const cancelButton = document.createElement('input') as HTMLInputElement;
            cancelButton.type = 'button';
            cancelButton.value = 'Cancel';
            cancelButton.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve();
            };
            footer.appendChild(cancelButton);
            div.appendChild(footer);
            div.style.display = 'flex';
        });
    }
}