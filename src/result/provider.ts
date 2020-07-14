import * as vscode from 'vscode';
import * as ply from 'ply-ct';

export type Result = {
    contents: string;
    start: number;
    end: number;
};

export class PlyResultUri {
    static SCHEME = 'ply-result';

    /**
     * @param result expected or actual result
     * @param testName name of specified test if any, otherwise Uri is for suite
     */
    constructor(readonly result: ply.Retrieval | ply.Storage, private testName?: string ) { }

    toUri(): vscode.Uri {
        const path = this.result.location.path;
        const scheme = PlyResultUri.SCHEME;
        const fragment = this.testName ? encodeURIComponent(this.testName) : undefined;
        if (this.result.location.isUrl) {
            return vscode.Uri.parse(path).with({
                scheme,
                fragment,
                query: `scheme=${this.result.location.scheme}`});
        }
        else {
            return vscode.Uri.file(path).with({
                scheme,
                fragment
            });
        }
    }

    /**
     * Loads object from yaml.
     */
    async load(): Promise<Result | undefined> {
        const contents = await this.result.read();
        if (contents) {
            const lines = contents.split(/\r?\n/);
            if (this.testName) {
                const yamlObj = ply.loadYaml(this.result.location.path, contents, true)[this.testName];
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
            return !!(await this.load());
        }
        else {
            return this.result.exists;
        }
    }

    label(workspaceDir: string): string {
        return this.result.location.relativeTo(workspaceDir) + (this.testName ? `#${this.testName}` : '');
    }

    static fromUri(uri: vscode.Uri): PlyResultUri {
        const scheme = uri.query?.substring(7) || 'file';
        const path = scheme === 'file' ? uri.fsPath : uri.with({scheme, query: undefined, fragment: undefined}).toString();
        const testName = uri.fragment ? decodeURIComponent(uri.fragment) : undefined;
        return new PlyResultUri(new ply.Retrieval(path), testName);
    }
}

export class PlyResultContentProvider implements vscode.TextDocumentContentProvider {


    constructor() {
    }

    dispose() {
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string | null> {
        const resultUri = PlyResultUri.fromUri(uri);
        if (await resultUri.result.exists) {
            const document = await vscode.workspace.openTextDocument(uri.with({ scheme: 'file', query: '' }));
            const yaml = document.getText();

            return yaml;
        }
        else {
            return ''; // return empty string for purposes of comparison
        }
    }
}