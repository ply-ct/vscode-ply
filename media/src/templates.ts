import { Descriptor, ConfigTemplate, FlowElement } from 'flowbee/dist/nostyles';
import * as jsYaml from 'js-yaml';

export class Templates {
    readonly templatePath: string;
    private templates = new Map<string, string>();
    private configTemplates = new Map<string, ConfigTemplate>();

    constructor(readonly base: string, private customDescriptors?: Descriptor[]) {
        this.templatePath = `${base}/templates`;
    }

    async get(path: string): Promise<string> {
        let template = this.templates.get(path);
        const resp = await fetch(`${this.templatePath}/${path}`);
        template = resp.status === 404 ? '{}' : await resp.text();
        this.templates.set(path, template);
        return template;
    }

    /**
     * Config templates
     */
    async getConfigTemplate(prefix: string, flowElement: FlowElement): Promise<ConfigTemplate> {
        const key = `${prefix}-${flowElement.type}-${flowElement.path}`;
        let template = this.configTemplates.get(key);
        if (!template) {
            if (flowElement.type === 'step') {
                const baseTemplate = this.parseTemplate(await this.get(`${prefix}/step.yaml`));
                if (!flowElement.path || flowElement.path === 'step') {
                    template = baseTemplate;
                } else {
                    if (flowElement.path?.endsWith('.ts')) {
                        const descriptor = this.customDescriptors?.find((d) => {
                            return d.path === flowElement.path;
                        });
                        if (descriptor?.template) {
                            template = this.parseTemplate(descriptor.template);
                        } else {
                            template = baseTemplate;
                        }
                    } else {
                        const path = `${prefix}/${flowElement.path}.yaml`;
                        template = this.parseTemplate(await this.get(path));
                    }
                    if (prefix === 'inspect') {
                        template = { ...baseTemplate, ...template };
                    } else {
                        template = { ...template, ...baseTemplate };
                    }
                }
            } else {
                const path = `${prefix}/${flowElement.type}.yaml`;
                template = this.parseTemplate(await this.get(path));
            }
            this.configTemplates.set(key, template);
        }
        return template;
    }

    private parseTemplate(template: ConfigTemplate | string): ConfigTemplate {
        if (typeof template === 'object') {
            return template;
        } else if (template.startsWith('{') && template.endsWith('}')) {
            return JSON.parse(template);
        } else {
            return jsYaml.load(template) as ConfigTemplate;
        }
    }
}
