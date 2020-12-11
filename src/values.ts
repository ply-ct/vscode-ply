import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { Log } from 'vscode-test-adapter-util';
import { PlyRoots } from './plyRoots';
import { PlyConfig } from './config';

/**
 * Caches latest result values so they're known at design-time.
 * Also keeps a copy of values from ply values files
 */
export class Values {

    private disposables: { dispose(): void }[] = [];
    private config: PlyConfig;
    private _plyValues: object | undefined;
    private resultWatcher: vscode.FileSystemWatcher;
    // result file uri to values object
    private resultValues = new Map<string,object>();

    constructor(
        readonly workspaceFolder: vscode.WorkspaceFolder,
        readonly plyRoots: PlyRoots,
        private readonly log: Log
    ) {
        this.config = new PlyConfig(workspaceFolder, log, async () => {
            this._plyValues = undefined;
            this.resultValues.clear();
            this.resultWatcher.dispose();
        });
        let resultsLoc = this.config.plyOptions.actualLocation;
        if (process.platform.startsWith('win')) {
            // watcher needs backslashes in RelativePattern base on windows
            resultsLoc = resultsLoc.replace(/\//g, '\\');

        }
        this.resultWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(resultsLoc, '**/*.{yml,yaml}')
        );
        this.disposables.push(this.resultWatcher);
        this.resultWatcher.onDidCreate(uri => this.onResultChange(uri));
        this.resultWatcher.onDidChange(uri => this.onResultChange(uri));
        this.resultWatcher.onDidDelete(uri => this.onResultChange(uri));
    }

    /**
     * Includes request and response object values
     */
    async getResultValues(suiteId: string): Promise<object> {
        const suite = this.plyRoots.getSuite(suiteId);
        if (!suite) {
            throw new Error(`No suite found: ${suiteId}`);
        }
        const resultUri = vscode.Uri.file(suite.runtime.results.actual.toString());
        let values: any = this.resultValues.get(resultUri.toString());
        if (!values) {
            values = JSON.parse(JSON.stringify(await this.getPlyValues()));
            const resultValues: any = {};
            if (suite.runtime.results.actual.exists) {
                const yaml = suite.runtime.results.getActualYaml();
                const obj = ply.loadYaml(resultUri.toString(), yaml.text);
                if (typeof obj === 'object') {
                    // TODO cases
                    if (suite.type === 'request') {
                        for (const key of Object.keys(obj)) {
                            if (obj.request) {
                                resultValues[key] = this.getResult(obj);
                            }
                        }
                    } else if (suite.type === 'flow') {
                        for (const key of Object.keys(obj)) {
                            const flowObj = obj[key];
                            if (flowObj.id?.startsWith('f')) {
                                for (const subKey of Object.keys(flowObj)) {
                                    const subObj = flowObj[subKey];
                                    if (subObj.request) {
                                        resultValues[`${flowObj.id}.${subObj.id}`] = this.getResult(subObj);
                                    }
                                }
                            } else if (flowObj.id?.startsWith('s') && flowObj.request) {
                                resultValues[flowObj.id] = this.getResult(flowObj);
                            }
                        }
                    }
                    values.__ply_results = resultValues;
                }
                this.resultValues.set(resultUri.toString(), values || {});
            }
        }
        return values;
    }

    private getResult(obj: any) {
        const request = obj.request;
        if (typeof request.body === 'string' && request.body.startsWith('{')) {
            request.body = JSON.parse(request.body);
        }
        const response = obj.response;
        if (typeof response.body === 'string' && response.body.startsWith('{')) {
            response.body = JSON.parse(response.body);
        }
        return { request, response };
    }

    async getPlyValues(): Promise<object> {
        if (!this._plyValues) {
            this._plyValues = await new ply.Values(this.config.plyOptions.valuesFiles, new ply.Logger()).read();
        }
        return this._plyValues || {};
    }

    private onResultChange(resultUri: vscode.Uri) {
        this.resultValues.delete(resultUri.toString());
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }

}