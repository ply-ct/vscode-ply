import * as flowbee from 'flowbee/dist/nostyles';

export class Templates {

    readonly templatePath: string;
    private templates = new Map<string,string>();

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
            path = `${prefix}/${pathOrElement}`;
        } else if (pathOrElement.type === 'flow') {
            path = `${prefix}/flow.yaml`;
        } else if (pathOrElement.type === 'link') {
            path = `${prefix}/link.yaml`;
        } else if (pathOrElement.type === 'subflow') {
            path = `${prefix}/subflow.yaml`;
        } else if (pathOrElement.type === 'note') {
            path = `${prefix}/note.yaml`;
        } else {
            path = `${prefix}/${(pathOrElement as any).path + '.yaml'}`;
        }
        let template = this.templates.get(path);
        if (!template) {
            const resp = await fetch(`${this.templatePath}/${path}`);
            if (resp.status === 404) {
                template = '{}';
            } else {
                template = await resp.text();
            }
            this.templates.set(path, template);
        }
        return template;
    }
}