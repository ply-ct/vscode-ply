import * as flowbee from 'flowbee/dist/nostyles';

export class Values {

    constructor(
        readonly flowFile: string,
        readonly iconBase: string,
        readonly files: string[],
        readonly defaults: object,
        public storeVals: any,
    ) { }

    /**
     * Prompts if needed and returns:
     *  - undefined if values just saved or run canceled
     *  - empty object if no values needed
     *  - otherwise map of name to defined value ('' if undefined)
     */
    async prompt(flowOrStep: flowbee.Flow | flowbee.Step, action: string, onlyIfNeeded: boolean,
        storageCall: (key: string, storeVals?: { [key: string]: string }) => void):
      Promise<{[key: string]: string} | 'Files' | undefined> {
        if (document.getElementById('flow-values')?.style?.display === 'flex') {
            return;
        }
        let name: string;
        let storageKey = `${this.flowFile}.values`;
        // flow-level workspace storage values
        if (this.storeVals && this.storeVals[storageKey]) {
            localStorage.setItem(storageKey, JSON.stringify(this.storeVals[storageKey]));
        }
        // needed values populated without user (storage) vals
        let needed: {[key: string]: string} = {};
        if (flowOrStep.type === 'step') {
            const step = flowOrStep as flowbee.Step;
            name = step.name.replace(/\r?\n/g, ' ');
            storageKey = `${this.flowFile}#${name}.values`;
            // step-level workspace storage values
            if (this.storeVals && this.storeVals[storageKey]) {
                localStorage.setItem(storageKey, JSON.stringify(this.storeVals[storageKey]));
            }
            needed = this.getNeeded(step, true);
        } else {
            const flow = flowOrStep as flowbee.Flow;
            name = flowbee.getFlowName(flow);
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
        }

        if (!onlyIfNeeded || Object.keys(needed).length > 0) {
            // sort by value name
            needed = Object.keys(needed).sort((n1, n2) => n1.localeCompare(n2)).reduce((obj: {[key: string]: string}, key) => {
                obj[key] = needed[key];
                return obj;
            }, {});

            const suppVals = { ... needed };
            this.supplementValues(storageKey, suppVals);

            if (onlyIfNeeded) {
                if (typeof Object.values(suppVals).find(v => v === '') === 'undefined') {
                    // no more needed -- convert from expressions
                    const vals = Object.keys(suppVals).reduce((acc: {[key: string]: string}, cur) => {
                        const key = cur.substring(2, cur.length - 1);
                        acc[key] = suppVals[cur];
                        return acc;
                    }, {});
                    return this.consolidateValues(vals);
                }
            }

            let tableVal = await this.renderTable(`Values for '${name}'`, action, storageKey, needed);
            if (tableVal && tableVal.length === 2) {
                if (tableVal[0] === 'Files') {
                    return 'Files';
                }

                while ((tableVal as any)[0] === 'Reset') {
                    localStorage.setItem(storageKey, '{}');
                    tableVal = await this.renderTable(`Values for '${name}'`, action, storageKey, needed);
                }

                const vals = (tableVal as any)[1];
                // save entered values in local storage
                if (vals) {
                    const storageVals: {[key: string]: string} = {};
                    for (const key of Object.keys(vals)) {
                        let expr = `\${${key}}`;
                        if (expr.startsWith('${__ply_results.')) {
                            expr = '${@' + expr.substring(16);
                        }
                        if (needed[expr] !== vals[key] || expr.startsWith('${@')) {
                            storageVals[expr] = vals[key];
                        }
                    }
                    localStorage.setItem(storageKey, JSON.stringify(storageVals));
                    storageCall(storageKey, storageVals);
                } else {
                    localStorage.removeItem(storageKey);
                    storageCall(storageKey);
                }
                if ((tableVal as any)[0] === 'Save') {
                    return; // Saved only
                } else {
                    if (vals) {
                        return this.consolidateValues(vals);
                    } else {
                        return (tableVal as any)[0] === 'Run' ? {} : vals;
                    }
                }
            } else {
                return; // Canceled
            }
        }

        return {};
    }

    /**
     * Returns an object map of value name to empty-string
     * (if not defined), or otherwise the defined value.
     */
    getNeeded(step: flowbee.Step, inclRefs = false): {[key: string]: string} {
        const needed: {[key: string]: string} = {};
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
                for (const expression of expressions) {
                    if (inclRefs || !expression.startsWith('${@')) {
                        const res = this.get(expression, this.defaults);
                        needed[expression] = res === expression ? '' : res || '';
                    }
                }
            }
        }
        return needed;
    }

    get isRows(): boolean {
        for (const file of this.files) {
            if (file.endsWith('.csv') || file.endsWith('.xlsx')) {
                return true;
            }
        }
        return false;
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

    /**
     * Adds values from local storage
     */
    supplementValues(storageKey: string, vals: {[key: string]: string}): string[] {
        let userKeys: string[] = [];
        if (storageKey.indexOf('#') > 0) {
            // step user values default to flow-level, before overridden by step storage
            userKeys = this.supplementValues(`${this.flowFile}.values`, vals);
        }
        const storageVal = localStorage.getItem(storageKey);
        if (storageVal) {
            const storageObj = JSON.parse(storageVal);
            for (const key of Object.keys(storageObj)) {
                if (storageObj[key] !== vals[key]) {
                    vals[key] = storageObj[key];
                    userKeys.push(key);
                }
            }
        }
        return userKeys;
    }

    /**
     * Removes values that are the same as defaults, so that everything
     * left is an exception.
     */
    private consolidateValues(vals: {[key: string]: string}): {[key: string]: string} {
        const consol: {[key: string]: string} = {};
        for (const key of Object.keys(vals)) {
            const expr = `\${${key}}`;
            const res = this.get(expr, this.defaults);
            if (expr.startsWith('${__ply_') || '' + res !== vals[key]) {
                consol[key] = vals[key];
            }
        }
        return consol;
    }

    renderTable(title: string, action: string, storageKey: string, needed: {[key: string]: string}):
      Promise<[string, {[key: string]: string} | undefined] | void> {
        return new Promise<[string, {[key: string]: string} | undefined] | void>(resolve => {
            // build html
            const div = document.getElementById('flow-values') as HTMLDivElement;
            const theme = document.body.className.endsWith('vscode-light') ? 'light': 'dark';
            div.className = `flowbee-configurator-${theme} flow-values`;
            const header = document.createElement('div') as HTMLDivElement;
            header.className = 'flowbee-config-header';
            const titleElem = document.createElement('div') as HTMLDivElement;
            titleElem.className = 'flowbee-config-title';
            const titleSpan = document.createElement('span') as HTMLSpanElement;
            titleSpan.innerText = title;
            titleElem.appendChild(titleSpan);
            const helpAnchor = document.createElement('a') as HTMLAnchorElement;
            helpAnchor.className = 'flow-values-help';
            helpAnchor.href = 'https://ply-ct.com/ply/topics/values#precedence';
            const helpImg = document.createElement('img') as HTMLImageElement;
            helpImg.alt = 'Values help';
            helpImg.src = `${this.iconBase}/help.svg`;
            helpAnchor.appendChild(helpImg);
            titleElem.appendChild(helpAnchor);
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
            const suppVals = { ...needed };
            let userKeys = this.supplementValues(storageKey, suppVals);
            let value = this.toString(suppVals) || '';
            const table = new flowbee.Table(
                [ { type: 'text', label: 'Expression' }, { type: 'text', label: 'Value' } ],
                value,
                false
            );
            this.shadeUserTds(table, userKeys, theme === 'dark');
            table.onTableUpdate(updateEvent => {
                value = updateEvent.value;
                const newVals = this.fromString(value);
                if (newVals) {
                    userKeys = [];
                    for (const key of Object.keys(newVals)) {
                        const expr = `\${${key}}`;
                        if (needed[expr] !== newVals[key]) {
                            userKeys.push(expr);
                        }
                    }
                    this.shadeUserTds(table, userKeys, theme === 'dark');
                }
            });
            tableContent.appendChild(table.tableElement);
            div.appendChild(content);
            const footer = document.createElement('div') as HTMLDivElement;
            footer.className = 'flowbee-config-footer';
            const filesButton = document.createElement('input') as HTMLInputElement;
            filesButton.type = 'button';
            filesButton.value = 'Values Files...';
            filesButton.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve(['Files', undefined]);
            };
            filesButton.className = 'flow-values-files';
            footer.appendChild(filesButton);
            const saveButton = document.createElement('input') as HTMLInputElement;
            saveButton.type = 'button';
            saveButton.value = 'Save';
            saveButton.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve(['Save', this.fromString(value)]);
            };
            footer.appendChild(saveButton);
            const okButton = document.createElement('input') as HTMLInputElement;
            okButton.type = 'button';
            okButton.value = `Save & ${action}`;
            okButton.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve([action, this.fromString(value)]);
            };
            footer.appendChild(okButton);
            const resetButton = document.createElement('input') as HTMLInputElement;
            resetButton.type = 'button';
            resetButton.value = 'Reset';
            resetButton.onclick = _e => {
                div.style.display = 'none';
                div.innerHTML = '';
                resolve(['Reset', this.fromString(value)]);
            };
            footer.appendChild(resetButton);

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

    private shadeUserTds(table: flowbee.Table, userKeys: string[], dark = false) {
        if (userKeys.length > 0) {
            for (const tr of table.tableElement.querySelectorAll('tr')) {
                const tds = tr.querySelectorAll('td');
                if (tds.length === 2) {
                    if (userKeys.includes(tds[0].innerText)) {
                        tds[1].style.backgroundColor = dark ? '#434e73' : '#cce8fe'; // '#123ec3';
                    } else {
                        tds[1].style.backgroundColor = '';
                    }
                }
            }
        }
    }
}