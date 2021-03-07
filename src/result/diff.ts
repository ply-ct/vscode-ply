import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { PlyRoots, Info } from '../plyRoots';
import { Result } from './result';
import { ResultDiffs, ResultDecorator } from './decorator';

/**
 * Write-through cached diff state.
 * TODO: see lucky #13
 */
export class DiffState {

    _state: any;

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly workspaceState: vscode.Memento
    ) {}

    get state(): any {
        if (!this._state) {
            this._state = this.workspaceState.get(`ply-diffs:${this.workspaceFolder.uri}`) || {} as any;
        }
        return this._state;
    }

    set state(value: any) {
        this._state = value;
        this.workspaceState.update(`ply-diffs:${this.workspaceFolder.uri}`, this._state);
    }

    getDiffs(testId: string): ply.Diff[] {
        return this.state[testId] || [];
    }

    /**
     * Writes regardless of cache mismatch
     */
    updateDiffs(testId: string, diffs: ply.Diff[]) {
        this.state = { [testId]: diffs, ...this.state };
        console.debug(`updated diff state for: ${testId}`);
    }

    clearDiffs(testId: string): boolean;
    clearDiffs(testIds: string[]): boolean;
    clearDiffs(testIds: string | string[]): boolean {
        const ids = typeof testIds === 'string' ? [testIds] : testIds;
        const diffState = this.state;
        let isChanged = false;
        for (const id of ids) {
            if (diffState[id]) {
                delete diffState[id];
                isChanged = true;
            }
        }
        if (isChanged) {
            this.state = diffState;
            console.debug(`cleared diff state for: ${testIds}`);
        }
        return isChanged;
    }

    clearState() {
        this.state = undefined;
        console.debug(`cleared all diff state for: ${this.workspaceFolder.uri}`);
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
    // TODO: remove from resultPairs on diff editor close
    private resultPairs: ResultPair[] = [];
    private timer: NodeJS.Timer | undefined = undefined;
    private activeEditor: vscode.TextEditor | undefined = undefined;

    constructor(
        readonly workspaceFolder: vscode.WorkspaceFolder,
        readonly plyRoots: PlyRoots,
        private readonly diffState: DiffState,
        private readonly decorator: ResultDecorator,
        private readonly retire: (testIds: string[]) => void,
        private readonly log: ply.Log
    ) {

        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor = undefined;
            if (editor) {
                let uri = editor.document.uri;
                if (uri.scheme === Result.URI_SCHEME) {
                    uri = Result.convertUri(uri);
                }
                if (uri.scheme === 'file' && uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)) {
                    this.activeEditor = editor;
                }
            }
            if (this.activeEditor) {
                this.checkUpdateDiffDecorations(this.activeEditor);
            }
        }));

        this.disposables.push(vscode.workspace.onDidChangeTextDocument(event => {
            const uri = event.document.uri;
            if (uri.scheme === 'file' && uri.fsPath.startsWith(this.workspaceFolder.uri.fsPath)) {
                const suiteId = this.plyRoots.getSuiteIdForExpectedResult(uri);
                if (suiteId) {
                    const testIds = this.plyRoots.getSuiteInfo(suiteId)?.children.map(c => c.id) || [];
                    // expected: only update decorations the first time (if diff state changed)
                    if (this.diffState.clearDiffs(testIds)) {
                        this.retire(testIds);
                        if (this.activeEditor) {
                            this.checkUpdateDiffDecorations(this.activeEditor);
                        }
                    }
                } else if (this.plyRoots.getSuiteIdForActualResult(uri)) {
                    // actual: update decorations regardless sinces it's probably due to rerun
                    if (this.activeEditor) {
                        this.checkUpdateDiffDecorations(this.activeEditor);
                    }
                }
            }
        }));
    }

    /**
     * Perform diff.
     * @param info test or suite info
     */
    async doDiff(info: Info) {
        const suite = this.plyRoots.getSuite(info.id);
        if (!suite) {
            throw new Error(`Ply suite not found for id: ${info.id}`);
        }
        const test = info.type === 'test' ? this.plyRoots.getTest(info.id) : undefined;

        const expected = suite.runtime.results.expected;
        const expectedResult = new Result(expected, test?.name, test?.type);
        let expectedLabel = expectedResult.label;
        if (!(await expected.exists)) {
            // even the suite file doesn't exist
            throw new Error(`Expected result file not found: ${expected.location}`);
        }
        let expectedUri = expectedResult.toUri();

        const actual = suite.runtime.results.actual;
        const actualResult = new Result(actual, test?.name, test?.type);
        let actualLabel = actualResult.label;
        let actualUri = actualResult.toUri();

        if (test) {
            // expected is read-only virtual file (except flows which are one test per file)
            expectedLabel = `(read-only fragment) ${expectedResult.plyResult.location.name}#${test?.name}`;
            actualLabel = `${expectedResult.plyResult.location.name}#${test?.name}`;
        }
        else {
            expectedUri = Result.convertUri(expectedUri);
            // actual uri cannot stay virtual to be read-only,
            // because then vscode.diff prompts when saving expected
            actualUri = Result.convertUri(actualUri);
        }
        if (!(await actualResult.exists())) {
            actualLabel = `(not found) ${actualLabel}`;
        }

        const title = `${expectedLabel} ⟷ ${actualLabel}`;
        const options: vscode.TextDocumentShowOptions = {
            preserveFocus: true
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
        expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor) {

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

        this.decorator.applyDecorations(expectedEditor, actualEditor, resultDiffs, !!resultPair.testName);
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