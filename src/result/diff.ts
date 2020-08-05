import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { Log } from 'vscode-test-adapter-util';
import { PlyRoots } from '../plyRoots';
import { Result } from './result';
import { ResultDiffs, ResultDecorator } from './decorator';

export class DiffState {

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly workspaceState: vscode.Memento
    ) {}

    get state(): any {
        return this.workspaceState.get(`ply-diffs:${this.workspaceFolder.uri}`) || {} as any;
    }

    set state(value: any) {
        this.workspaceState.update(`ply-diffs:${this.workspaceFolder.uri}`, value);
    }

    getDiffs(testId: string): ply.Diff[] {
        return this.state[testId] || [];
    }

    updateDiffs(testId: string, diffs: ply.Diff[]) {
        this.state = { [testId]: diffs, ...this.state };
    }

    clearDiffs(testId: string): void;
    clearDiffs(testIds: string[]): void;
    clearDiffs(testIds: string | string[]) {
        const ids = typeof testIds === 'string' ? [testIds] : testIds;
        const diffState = this.state;
        ids.forEach(id => delete diffState[id]);
        this.state = diffState;
    }

    clearState() {
        this.state = undefined;
    }
}

interface ResultPair {
    infoId: string; // test or suite id
    testName?: string;
    expectedUri: vscode.Uri;
    expectedResult: Result;
    actualUri: vscode.Uri;
    actualResult: Result;
}

export class DiffHandler {

    private disposables: { dispose(): void }[] = [];
    private resultPairs: ResultPair[] = [];
    private timer: NodeJS.Timer | undefined = undefined;
    private activeEditor: vscode.TextEditor | undefined = undefined;

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly plyRoots: PlyRoots,
        private readonly diffState: DiffState,
        private readonly decorator: ResultDecorator,
        private readonly log: Log
    ) {

        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                let uri = editor.document.uri;
                if (uri.scheme === Result.URI_SCHEME) {
                    uri = Result.convertUri(uri);
                }
                this.activeEditor = vscode.workspace.getWorkspaceFolder(uri) === this.workspaceFolder ? editor : undefined;
            } else {
                this.activeEditor = undefined;
            }
            if (this.activeEditor) {
                this.checkUpdateDiffDecorations(this.activeEditor);
            }
        }));

        this.disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
            // TODO clear suite diff state on first result edit
            // if (this.activeEditor && event.document === this.activeEditor.document) {
            //     this.checkUpdateDiffDecorations(this.activeEditor);
            // }
        }));
    }

    /**
     * Perform diff.
     * @param infoId test or suite id
     */
    async doDiff(infoId: string) {
        const info = this.plyRoots.findInfo(infoId);
        if (!info) {
            // could be a suite/test from another adapter (eg: mocha)
            this.log.warn(`Ply test info not found for id: ${infoId} (not a ply test?)`);
            return;
        }

        const suite = info.type === 'test' ? this.plyRoots.getSuiteForTest(info.id) : this.plyRoots.getSuite(info.id);
        if (!suite) {
            throw new Error(`Ply suite not found for id: ${info.id}`);
        }
        const test = info.type === 'test' ? this.plyRoots.getTest(info.id) : undefined;

        const expected = suite.runtime.results.expected;
        const expectedResult = new Result(expected, test?.name);
        let expectedLabel = expectedResult.label;
        if (!(await expectedResult.exists())) {
            throw new Error(`Expected result not found: ${expectedLabel}`);
        }
        let expectedUri = expectedResult.toUri();

        const actual = suite.runtime.results.actual;
        const actualResult = new Result(actual, test?.name);
        let actualLabel = actualResult.label;
        const actualUri = actualResult.toUri();

        if (test) {
            // expected is read-only virtual file
            expectedLabel = `(read-only segment) ${expectedResult.plyResult.location.name}#${test?.name}`;
            actualLabel = `${expectedResult.plyResult.location.name}#${test?.name}`;
        }
        else {
            expectedUri = Result.convertUri(expectedUri);
            // actual uri stays virtual so as to be read-only
        }
        if (!(await actualResult.exists())) {
            actualLabel = `(not found) ${actualLabel}`;
        }

        const title = `${expectedLabel} ⟷ ${actualLabel}`;
        const options: vscode.TextDocumentShowOptions = {
            preserveFocus: false,
            preview: true
        };

        await vscode.commands.executeCommand('vscode.diff', expectedUri, actualUri, title, options);
        const expectedEditor = vscode.window.visibleTextEditors.find(editor => {
            return editor.document.uri.toString() === expectedUri.toString();
        });
        const actualEditor = vscode.window.visibleTextEditors.find(editor => {
            return editor.document.uri.toString() === actualUri.toString();
        });

        if (expectedEditor && actualEditor) {
            const existingPairIdx = this.resultPairs.findIndex(pair => {
                return pair.expectedUri.toString() === expectedUri.toString() &&
                    pair.actualUri.toString() === actualUri.toString();
            });
            if (existingPairIdx >= 0) {
                this.resultPairs.splice(existingPairIdx, 1);
            }

            const pair: ResultPair = {
                infoId: info.id,
                testName: test?.name,
                expectedUri,
                expectedResult,
                actualUri,
                actualResult
            };
            this.resultPairs.push(pair);
            this.updateDiffDecorations(pair, expectedEditor, actualEditor);
        }
    }

    /**
     * Applies decorations only if diff state exists for the pair
     */
    async updateDiffDecorations(resultPair: ResultPair,
        expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor, clearDiffState = false) {

        const diffState = this.diffState.state || {};
        await this.checkEnableDiffEditorCodeLens();

        let diffs: ply.Diff[];
        const resultDiffs: ResultDiffs[] = [];
        if (resultPair.testName) {
            diffs = diffState[resultPair.infoId];
            if (diffs) {
                resultDiffs.push({
                    testId: resultPair.infoId,
                    expectedStart: await resultPair.expectedResult.getStart(),
                    expectedEnd: await resultPair.expectedResult.getEnd(),
                    actualStart: await resultPair.actualResult.getStart(),
                    actualEnd: await resultPair.actualResult.getEnd(),
                    diffs
                });
            }
        }
        else {
            const testInfos = this.plyRoots.getTestInfosForSuite(resultPair.infoId);
            for (const actualTest of await resultPair.actualResult.includedTestNames()) {
                const testInfo = testInfos.find(ti => ti.label === actualTest);
                if (!testInfo) {
                    vscode.window.showErrorMessage(`Test info '${actualTest}' not found in suite: ${resultPair.infoId}`);
                    return;
                }
                diffs = diffState[testInfo.id];
                if (diffs) {
                    resultDiffs.push({
                        testId: testInfo.id,
                        expectedStart: await resultPair.expectedResult.getStart(testInfo.label),
                        expectedEnd: await resultPair.expectedResult.getEnd(testInfo.label),
                        actualStart: await resultPair.actualResult.getStart(testInfo.label),
                        actualEnd: await resultPair.actualResult.getEnd(testInfo.label),
                        diffs
                    });
                }
            }
        }

        this.decorator.applyDecorations(expectedEditor, actualEditor, resultDiffs);
    }

    async checkEnableDiffEditorCodeLens() {
        const diffEdSettings = vscode.workspace.getConfiguration('diffEditor', this.workspaceFolder.uri);
        if (!diffEdSettings.get('codeLens')) {
            const plySettings = vscode.workspace.getConfiguration('ply');
            let diffCodeLensSetting = plySettings.get('enableDiffEditorCodeLens', 'Prompt');
            if (diffCodeLensSetting === 'Prompt') {
                let response = await vscode.window.showInformationMessage(
                    'Ply result comparisons work best with vscode\'s \'diffEditor.codeLens\' setting. Enable for this workspace?',
                    'Yes', 'No', 'Don\'t ask again'
                );
                if (response && response !== 'No') {
                    response = response === 'Yes' ? 'Always' : 'Never'; // convert to valid enum
                    if (response !== diffCodeLensSetting) {
                        diffCodeLensSetting = response;
                        await plySettings.update('enableDiffEditorCodeLens', diffCodeLensSetting, vscode.ConfigurationTarget.Global);
                    }
                }
            }
            if (diffCodeLensSetting === 'Always') {
                await diffEdSettings.update('codeLens', true, vscode.ConfigurationTarget.Workspace);
            }
        }
    }

    delay(ms: number) {
        return new Promise(resolve => {
            this.timer = setTimeout(resolve, ms);
        });
    }

	async checkUpdateDiffDecorations(editor: vscode.TextEditor) {
        let resultPair: ResultPair | undefined = undefined;
        let expectedEditor: vscode.TextEditor | undefined = undefined;
        let actualEditor: vscode.TextEditor | undefined = undefined;
        for (let i = 0; i < this.resultPairs.length; i++) {
            const pair = this.resultPairs[i];
            if (pair.expectedUri.toString() === editor.document.uri.toString()) {
                expectedEditor = editor;
                actualEditor = vscode.window.visibleTextEditors.find(ed => {
                    return ed.document.uri.toString() === pair.actualUri.toString();
                });
                if (actualEditor) {
                    resultPair = pair;
                    break;
                }
            }
            if (pair.actualUri.toString() === editor.document.uri.toString()) {
                actualEditor = editor;
                expectedEditor = vscode.window.visibleTextEditors.find(ed => {
                    return ed.document.uri.toString() === pair.expectedUri.toString();
                });
                if (expectedEditor) {
                    resultPair = pair;
                    break;
                }
            }
        }
        if (resultPair && expectedEditor && actualEditor) {
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = undefined;
            }
            await this.delay(500);
            await this.updateDiffDecorations(resultPair, expectedEditor, actualEditor);
        }
    }

    dispose() {
        this.resultPairs = [];
        this.activeEditor = undefined;
        this.timer = undefined;
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}