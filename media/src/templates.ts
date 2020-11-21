import * as flowbee from 'flowbee';

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
    async get(pathOrElement: flowbee.FlowElement | string): Promise<string> {
        let path: string;
        if (typeof pathOrElement === 'string') {
            path = pathOrElement;
        } else if (pathOrElement.type === 'flow') {
            path = 'flow.yaml';
        } else if (pathOrElement.type === 'link') {
            path = 'link.yaml';
        } else if (pathOrElement.type === 'subflow') {
            path = 'subflow.yaml';
        } else if (pathOrElement.type === 'note') {
            path = 'note.yaml';
        } else {
            path = (pathOrElement as any).path + '.yaml';
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