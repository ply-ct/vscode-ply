import * as flowbee from 'flowbee/dist/nostyles';

export class Templates {
    readonly templatePath: string;
    private templates = new Map<string, string>();

    constructor(readonly base: string) {
        this.templatePath = `${base}/templates`;
    }

    /**
     * Template contents
     * @param pathOrElement relative to template path
     */
    async get(pathOrElement: flowbee.FlowElement | string, prefix = ''): Promise<string> {
        let path: string;
        if (prefix && !prefix.endsWith('/')) {
            prefix += '/';
        }
        if (typeof pathOrElement === 'string') {
            path = `${prefix}${pathOrElement}`;
        } else {
            const flowElement: flowbee.FlowElement = pathOrElement;
            const flowElementPath =
                flowElement.type === 'flow'
                    ? 'flow'
                    : (flowElement as any).path || flowElement.type;
            path = `${prefix}${flowElementPath}.yaml`;
        }
        let template = this.templates.get(path);
        if (!template) {
            let resp = await fetch(`${this.templatePath}/${path}`);
            if (resp.status === 404) {
                const elementType = (pathOrElement as any).type;
                if (elementType && path !== elementType) {
                    // fall back to generic element type template
                    resp = await fetch(`${this.templatePath}/${prefix}${elementType}.yaml`);
                }
            }
            template = resp.status === 404 ? '{}' : await resp.text();
            this.templates.set(path, template);
        }
        return template;
    }
}
