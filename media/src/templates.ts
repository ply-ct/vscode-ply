import * as flowbee from 'flowbee/dist/nostyles';

export class Templates {
    readonly templatePath: string;
    private templates = new Map<string, string | flowbee.ConfigTemplate>();

    constructor(readonly base: string, private customDescriptors?: flowbee.Descriptor[]) {
        this.templatePath = `${base}/templates`;
    }

    /**
     * Template contents
     * @param pathOrElement relative to template path
     */
    async get(
        pathOrElement: flowbee.FlowElement | string,
        prefix = ''
    ): Promise<string | flowbee.ConfigTemplate> {
        let path: string | undefined;
        let template: string | flowbee.ConfigTemplate | undefined;
        if (prefix && !prefix.endsWith('/')) {
            prefix += '/';
        }
        if (typeof pathOrElement === 'string') {
            path = `${prefix}${pathOrElement}`;
        } else {
            const flowElement: flowbee.FlowElement = pathOrElement;
            path = flowElement.path;
            if (path?.endsWith('.ts')) {
                const descriptor = this.customDescriptors?.find((d) => d.path === path);
                if (descriptor?.template) {
                    if (typeof descriptor.template === 'object') {
                        template = descriptor.template as flowbee.ConfigTemplate;
                    } else {
                        template = '' + descriptor.template;
                    }
                }
            } else {
                const flowElementPath =
                    flowElement.type === 'flow' ? 'flow' : flowElement.path || flowElement.type;
                path = `${prefix}${flowElementPath}.yaml`;
            }
        }
        if (!template) template = this.templates.get(path);
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
