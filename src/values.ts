import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { TypedEvent as Event, Listener, Disposable } from 'flowbee';
import { PlyRoots } from './plyRoots';
import { PlyConfig } from './config';

/**
 * No resultUri means a values file change (potentially)
 * affects all tests' values.
 */
export interface ValuesUpdateEvent {
    resultUri?: vscode.Uri;
}

/**
 * Caches latest result values so they're known at design-time.
 * Also keeps a copy of values from ply values files
 */
export class Values implements Disposable {

    private disposables: { dispose(): void }[] = [];
    private config: PlyConfig;
    private _plyValues: object | undefined;
    files: string[] | undefined;
    private resultWatcher?: vscode.FileSystemWatcher;
    // result file uri to values object
    private resultValues = new Map<string,object>();
    private valuesWatchers = new Map<string,vscode.FileSystemWatcher>();

    private _onValuesUpdate = new Event<ValuesUpdateEvent>();
    onValuesUpdate(listener: Listener<ValuesUpdateEvent>): Disposable {
        return this._onValuesUpdate.on(listener);
    }

    constructor(
        workspaceFolder: vscode.WorkspaceFolder,
        private readonly plyRoots: PlyRoots,
        private readonly log: ply.Log
    ) {
        this.config = new PlyConfig(workspaceFolder, async () => {
            this._plyValues = undefined;
            this.watchResultFiles();
            this.watchValuesFiles();
        });

        this.watchResultFiles();
        this.watchValuesFiles();
    }

    /**
     * watch for result changes
     */
    private watchResultFiles() {
        this.resultValues.clear();
        this.resultWatcher?.dispose();
        let resultsLoc = this.config.plyOptions.actualLocation;
        if (process.platform.startsWith('win')) {
            // watcher needs backslashes in RelativePattern base on windows
            resultsLoc = resultsLoc.replace(/\//g, '\\');
        }
        this.resultWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(resultsLoc, '**/*.{yml,yaml}')
        );
        this.disposables.push(this.resultWatcher);
        const onResultFileChange = (resultFileUri: vscode.Uri) => {
            this.resultValues.delete(resultFileUri.toString());
            this._onValuesUpdate.emit({ resultUri: resultFileUri });
        };
        this.resultWatcher.onDidCreate(uri => onResultFileChange(uri));
        this.resultWatcher.onDidChange(uri => onResultFileChange(uri));
        this.resultWatcher.onDidDelete(uri => onResultFileChange(uri));
    }

    /**
     * watch for values file changes
     */
    private watchValuesFiles() {
        this.valuesWatchers.forEach(watcher => watcher.dispose());
        this.valuesWatchers.clear();
        for (let file of this.config.plyOptions.valuesFiles) {
            if (process.platform.startsWith('win')) {
                file = file.replace(/\//g, '\\');
            }
            const valuesWatcher = vscode.workspace.createFileSystemWatcher(file);
            this.disposables.push(valuesWatcher);
            const onValuesFileChange = () => {
                this.clear();
            };
            valuesWatcher.onDidChange(_uri => onValuesFileChange());
            valuesWatcher.onDidDelete(uri => {
                valuesWatcher.dispose();
                this.valuesWatchers.delete(uri.toString());
                onValuesFileChange();
            });
            this.valuesWatchers.set(vscode.Uri.file(file).toString(), valuesWatcher);
        }
    }

    /**
     * Includes request and response object values
     */
    async getResultValues(suiteId: string): Promise<object> {
        const suite = this.plyRoots.getSuite(suiteId);
        if (!suite) {
            return JSON.parse(JSON.stringify(await this.getPlyValues())); // clone
        }
        const resultUri = vscode.Uri.file(suite.runtime.results.actual.toString());
        let values: any = this.resultValues.get(resultUri.toString());
        if (!values) {
            values = JSON.parse(JSON.stringify(await this.getPlyValues())); // clone
            if (suite.type === 'flow') {
                const plyFlow = (suite as any).plyFlow as ply.Flow;
                if (plyFlow?.flow?.attributes?.values) {
                    const rows = JSON.parse(plyFlow.flow.attributes.values);
                    for (const row of rows) {
                        values[row[0]] = row[1];
                    }
                }
            }
            const actualResults: any = {};
            if (suite.runtime.results.actual.exists) {
                try {
                    const yaml = suite.runtime.results.getActualYaml();
                    const obj = ply.loadYaml(resultUri.toString(), yaml.text);
                    if (typeof obj === 'object') {
                        // TODO cases
                        if (suite.type === 'request') {
                            for (const key of Object.keys(obj)) {
                                if (obj.request) {
                                    actualResults[key] = this.getResult(obj);
                                }
                            }
                        } else if (suite.type === 'flow') {
                            for (const key of Object.keys(obj)) {
                                const flowObj = obj[key];
                                if (flowObj.id?.startsWith('f')) {
                                    for (const subKey of Object.keys(flowObj)) {
                                        const subObj = flowObj[subKey];
                                        if (subObj.request) {
                                            actualResults[`${flowObj.id}.${subObj.id}`] = this.getResult(subObj);
                                        }
                                    }
                                } else if (flowObj.id?.startsWith('s') && flowObj.request) {
                                    actualResults[flowObj.id] = this.getResult(flowObj);
                                }
                            }
                        }
                        values.__ply_results = actualResults;
                    }
                    this.resultValues.set(resultUri.toString(), values || {});
                } catch (err) {
                    console.error(err);
                    this.log.error(`Cannot process results for suite: ${suiteId}`);
                    this.log.error(err);
                }
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

    async getPlyValues(): Promise<object | void> {
        if (!this._plyValues) {
            this.files = this.config.plyOptions.valuesFiles;
            const plyValues = new ply.Values(this.config.plyOptions.valuesFiles, new ply.Logger());
            this._plyValues = await plyValues.read();
        }
        return this._plyValues || {};
    }

    clear() {
        this.resultValues.clear();
        this._plyValues = undefined;
        this.config.clearPlyOptions();
        this._onValuesUpdate.emit({});
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}