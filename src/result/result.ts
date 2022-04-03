import * as os from 'os';
import * as fs from 'fs';
import * as url from 'url';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';

export type ResultContents = {
    contents: string;
    start: number;
    end: number;
};

export interface TestResult {
    state?: 'passed' | 'failed' | 'skipped' | 'errored';
    message?: string;
}

export class Result {
    static URI_SCHEME = 'ply-result';

    /**
     * @param plyResult expected or actual result
     * @param testName name of specified test if any, otherwise Uri is for suite
     */
    constructor(
        readonly plyResult: ply.Retrieval | ply.Storage,
        readonly testName?: string,
        readonly type?: ply.TestType
    ) {}

    /**
     * uri with ply-result schema
     */
    toUri(): vscode.Uri {
        const path = this.plyResult.location.path;
        const scheme = Result.URI_SCHEME;
        const fragment = this.testName ? encodeURIComponent(this.testName) : undefined;
        if (this.plyResult.location.isUrl) {
            return vscode.Uri.parse(path).with({
                scheme,
                fragment,
                query: `scheme=${this.plyResult.location.scheme}&type=${this.type}`
            });
        } else {
            return vscode.Uri.file(path).with({
                scheme,
                fragment,
                query: `type=${this.type}`
            });
        }
    }

    /**
     * Convert ply-result uri to file or http/s uri.
     */
    static convertUri(plyResultUri: vscode.Uri): vscode.Uri {
        let scheme = 'file';
        if (plyResultUri.query) {
            const u = new url.URL(plyResultUri.toString(true));
            const s = u.searchParams.get('scheme');
            if (s) {
                scheme = s;
            }
        }
        return plyResultUri.with({ scheme, query: '', fragment: '' });
    }

    /**
     * Create result from location or ply-result uri.
     */
    static fromUri(uri: vscode.Uri): Result {
        let type: string | undefined;
        if (uri.query) {
            const u = new url.URL(uri.toString(true));
            const t = u.searchParams.get('type');
            if (t) {
                type = t;
            }
        }
        const locUri = uri.scheme === Result.URI_SCHEME ? Result.convertUri(uri) : uri;
        const path = locUri.scheme === 'file' ? locUri.fsPath : locUri.toString();
        const testName = uri.fragment ? decodeURIComponent(uri.fragment) : undefined;
        return new Result(new ply.Retrieval(path), testName, type as ply.TestType);
    }

    /**
     * TODO: memoize: load only once per instance?
     */
    private async load(): Promise<string | undefined> {
        if (fs.existsSync(this.plyResult.location.path) && this.getWorkspaceFolderUri()) {
            const document = await vscode.workspace.openTextDocument(
                Result.convertUri(this.toUri())
            );
            return document.getText();
        } else {
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

    async getStart(testName?: string, instNum = 0): Promise<number> {
        if (testName) {
            let yamlObj = await this.loadYaml();
            if (yamlObj) {
                if (this.type === 'flow') {
                    yamlObj = ply.ResultPaths.extractById(yamlObj, testName, instNum);
                } else {
                    yamlObj = yamlObj[testName];
                }
                return yamlObj ? yamlObj.__start : 0;
            }
            return 0;
        } else {
            return 0;
        }
    }

    async getEnd(testName?: string, instNum = 0): Promise<number> {
        if (testName) {
            let yamlObj = await this.loadYaml();
            if (yamlObj) {
                if (this.type === 'flow') {
                    yamlObj = ply.ResultPaths.extractById(yamlObj, testName, instNum);
                } else {
                    yamlObj = yamlObj[testName];
                }
                return yamlObj ? yamlObj.__end : 0;
            }
            return 0;
        } else {
            const contents = await this.load();
            return ply.util.lines(contents || '').length;
        }
    }

    /**
     * Loads object from yaml.
     */
    async readResultContents(): Promise<ResultContents | undefined> {
        const contents = await this.load();
        if (contents) {
            const lines = ply.util.lines(contents);
            if (this.testName) {
                let yamlObj = await this.loadYaml();
                if (this.type === 'flow') {
                    const instNum = 0;
                    // extraction expects hyphens instead of dots separating f from s (why?)
                    yamlObj = ply.ResultPaths.extractById(
                        yamlObj,
                        this.testName.replace('.', '-'),
                        instNum
                    );
                } else {
                    yamlObj = yamlObj[this.testName];
                }
                if (yamlObj) {
                    const contents = lines.slice(yamlObj.__start, yamlObj.__end + 1).join('\n');
                    return { contents, start: yamlObj.__start, end: yamlObj.__end };
                }
            } else {
                return { contents, start: 0, end: lines.length - 1 };
            }
        }
    }

    async updateResultContents(fileUri: vscode.Uri, contents: string = '') {
        const resultContents = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString(
            'utf8'
        );
        let updatedContents = '';
        if (this.testName) {
            let yamlObj = ply.loadYaml(fileUri.toString(), resultContents, true);
            if (this.type === 'flow') {
                const instNum = 0;
                yamlObj = ply.ResultPaths.extractById(yamlObj, this.testName, instNum);
            } else {
                yamlObj = yamlObj[this.testName];
            }
            if (!yamlObj) throw new Error(`'${this.testName}' YAML object not found in ${fileUri}`);
            const lines = ply.util.lines(resultContents);
            updatedContents =
                lines.slice(0, yamlObj.__start).join(os.EOL) +
                (yamlObj.__start > 0 ? os.EOL : '') +
                contents +
                (yamlObj.__end < lines.length - 1 ? os.EOL : '') +
                lines.slice(yamlObj.__end + 1).join(os.EOL);
        } else {
            updatedContents = contents;
        }
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(updatedContents, 'utf8'));
    }

    /**
     * Suite file exists, and specified test if any is present in yaml.
     */
    async exists(): Promise<boolean> {
        if (this.testName) {
            return !!(await this.readResultContents());
        } else {
            return this.plyResult.exists;
        }
    }

    isSuite(): boolean {
        return !this.testName;
    }

    getWorkspaceFolderUri(): vscode.Uri | undefined {
        const uri = Result.convertUri(this.toUri());
        if (uri.fsPath) {
            return vscode.workspace.getWorkspaceFolder(uri)?.uri;
        }
    }

    async includedTestNames(): Promise<string[]> {
        const yamlObj = await this.loadYaml();
        if (yamlObj) {
            return Object.keys(yamlObj).filter((key) => {
                // id is only on flow elements, and only subflows start with f
                return !yamlObj[key].id?.startsWith('f');
            });
        } else {
            return [];
        }
    }

    get label(): string {
        let path;
        const workspaceFolderUri = this.getWorkspaceFolderUri();
        if (workspaceFolderUri) {
            path = this.plyResult.location.relativeTo(workspaceFolderUri.fsPath);
        } else {
            path = this.plyResult.location.path;
        }
        return this.testName ? `${path}#${this.testName}` : path;
    }
}
