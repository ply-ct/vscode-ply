export class Templates {

    readonly templatePath: string;
    private templates = new Map<string,string>();

    constructor(readonly base: string) {
        this.templatePath = `${base}/templates`;
    }

    /**
     * Template contents
     * @param path relative to template path
     */
    async get(path: string): Promise<string> {
        let template = this.templates.get(path);
        if (!template) {
            template = await (await fetch(`${this.templatePath}/${path}`)).text();
            this.templates.set(path, template);
        }
        return template;
    }
}