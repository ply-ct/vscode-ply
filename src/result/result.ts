import * as fs from 'fs';
import * as vscode from 'vscode';
import * as ply from 'ply-ct';

export type ResultContents = {
    contents: string;
    start: number;
    end: number;
}

export class Result {
    static URI_SCHEME = 'ply-result';

    /**
     * @param plyResult expected or actual result
     * @param testName name of specified test if any, otherwise Uri is for suite
     */
    constructor(
        readonly plyResult: ply.Retrieval | ply.Storage,
        readonly testName?: string
    ) { }

    toUri(): vscode.Uri {
        const path = this.plyResult.location.path;
        const scheme = Result.URI_SCHEME;
        const fragment = this.testName ? encodeURIComponent(this.testName) : undefined;
        if (this.plyResult.location.isUrl) {
            return vscode.Uri.parse(path).with({
                scheme,
                fragment,
                query: `scheme=${this.plyResult.location.scheme}`});
        }
        else {
            return vscode.Uri.file(path).with({
                scheme,
                fragment
            });
        }
    }

    /**
     * Converts ply-result uri to file or http/s uri.
     */
    static convertUri(plyResultUri: vscode.Uri): vscode.Uri {
        const scheme = plyResultUri.query?.substring(7) || 'file';
        return plyResultUri.with({scheme, query: '', fragment: ''});
    }

    static fromUri(plyResultUri: vscode.Uri): Result {
        const uri = Result.convertUri(plyResultUri);
        const path = uri.scheme === 'file' ? uri.fsPath : uri.toString();
        const testName = plyResultUri.fragment ? decodeURIComponent(plyResultUri.fragment) : undefined;
        return new Result(new ply.Retrieval(path), testName);
    }

    /**
     * TODO: memoize load only once per instance
     */
    private async load(): Promise<string | undefined> {
        if (fs.existsSync(this.plyResult.location.path) && this.isInWorkspace()) {
            const document = await vscode.workspace.openTextDocument(Result.convertUri(this.toUri()));
            return document.getText();
        }
        else {
            return await this.plyResult.read();
        }
    }

    /**
     * Load yaml object containing test object properties
     * TODO: parse only once per instance
     */
    private async loadYaml(): Promise<any> {
        const contents = await this.load();
        if (contents) {
            return ply.loadYaml(this.plyResult.location.path, contents, true);
        }
    }

    async getStart(testName?: string): Promise<number> {
        if (testName) {
            const yaml = await this.loadYaml();
            const yamlObj = yaml ? yaml[testName] : undefined;
            return yamlObj ? yamlObj.__start : 0;
        }
        else {
            return 0;
        }
    }

    async getEnd(testName?: string): Promise<number> {
        if (testName) {
            const yaml = await this.loadYaml();
            const yamlObj = yaml ? yaml[testName] : undefined;
            return yamlObj ? yamlObj.__end : 0;
        }
        else {
            const contents = await this.load();
            return ply.util.lines(contents || '').length;
        }
    }

    /**
     * Loads object from yaml.
     */
    async getResultContents(): Promise<ResultContents | undefined> {
        const contents = await this.load();
        if (contents) {
            const lines = ply.util.lines(contents);
            if (this.testName) {
                const yamlObj = (await this.loadYaml())[this.testName];
                if (yamlObj) {
                    const contents = lines.slice(yamlObj.__start, yamlObj.__end + 1).join('\n');
                    return { contents, start: yamlObj.__start, end: yamlObj.__end };
                }
            }
            else {
                return { contents, start: 0, end: lines.length - 1};
            }
        }
    }

    /**
     * Suite file exists, and specified test if any is present in yaml.
     */
    async exists(): Promise<boolean> {
        if (this.testName) {
            return !!(await this.getResultContents());
        }
        else {
            return this.plyResult.exists;
        }
    }

    isSuite(): boolean {
        return !this.testName;
    }

    isInWorkspace(): boolean {
        // TODO handle multiple workspace folders
        const workspaceDir = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const location = this.plyResult.location;
        if (location.isUrl) {
            return false;
        }
        else {
            return location.isChildOf(workspaceDir);
        }
    }

    async includedTestNames(): Promise<string[]> {
        const yamlObj = await this.loadYaml();
        return yamlObj ? Object.keys(yamlObj) : [];
    }

    get label(): string {
        let path;
        if (this.isInWorkspace()) {
            // TODO handle multiple workspace folders
            const workspaceDir = vscode.workspace.workspaceFolders![0].uri.fsPath;
            path = this.plyResult.location.relativeTo(workspaceDir);
        }
        else {
            path = this.plyResult.location.path;
        }
        return this.testName ? `${path}#${this.testName}` : path;
    }
}