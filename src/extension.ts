import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';
import { PlyAdapter } from './adapter';
import { ResultContentProvider } from './result/provider';
import { Result } from './result/result';
import { PlyConfig } from './config';
import { PlyRoots } from './plyRoots';
import { ResultDiffs, ResultDecorator } from './result/decorator';


interface ResultPair {
    infoId: string; // test or suite id
    testName?: string;
    expectedUri: vscode.Uri;
    expectedResult: Result;
    actualUri: vscode.Uri;
    actualResult: Result;
}

export async function activate(context: vscode.ExtensionContext) {

    // get the Test Explorer extension
    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
    console.log(`Test Explorer extension ${testExplorerExtension ? '' : 'not '}found`);

    if (!testExplorerExtension) {
        return;
    }

    console.log('vscode-ply is active');

    // TODO handle multiple workspace folders
    const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
    const outputChannel = vscode.window.createOutputChannel('Ply Tests');
    const log = new Log('ply', undefined, 'Ply Invoker');

    // TODO listen for workspace folder(s)
    if (!workspaceFolder) {
        log.info('No workspace folder to ply');
        return;
    }

    const config = new PlyConfig(workspaceFolder, log);

    context.subscriptions.push(log);

    const plyRoots = new PlyRoots(workspaceFolder.uri);
    const testHub = testExplorerExtension.exports;
    // register PlyAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
        testHub,
        workspaceFolder => new PlyAdapter(workspaceFolder, context.workspaceState, outputChannel, plyRoots, log),
        log
    ));

    // register for ply.result scheme
    const resultContentProvider = new ResultContentProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(Result.URI_SCHEME, resultContentProvider));

    const resultPairs: ResultPair[] = [];

    const diffCommand = vscode.commands.registerCommand('ply.diff', async (...args: any[]) => {
        try {
            if (args.length) {
                const node = args[0];
                if (node.adapterIds) {
                    const id = node.adapterIds[0];  // suiteId is file uri
                    log.debug(`ply.diff item id: ${id}`);

                    const info = plyRoots.findTestOrSuiteInfo(id);
                    if (!info) {
                        vscode.window.showErrorMessage(`Ply test info not found for id: ${id}`);
                        return;
                    }

                    const suite = info.type === 'test' ? plyRoots.getSuiteForTest(id) : plyRoots.getSuite(id);
                    if (!suite) {
                        throw new Error(`Ply suite not found for id: ${id}`);
                    }
                    const test = info.type === 'test' ? plyRoots.getTest(id) : undefined;

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

                    vscode.commands.executeCommand('vscode.diff', expectedUri, actualUri, title, options).then(() => {
                        const expectedEditor = vscode.window.visibleTextEditors.find(editor => {
                            return editor.document.uri.toString() === expectedUri.toString();
                        });
                        const actualEditor = vscode.window.visibleTextEditors.find(editor => {
                            return editor.document.uri.toString() === actualUri.toString();
                        });

                        if (expectedEditor && actualEditor) {
                            const existingPairIdx = resultPairs.findIndex(pair => {
                                return pair.expectedUri.toString() === expectedUri.toString() &&
                                    pair.actualUri.toString() === actualUri.toString();
                            });
                            if (existingPairIdx >= 0) {
                                resultPairs.splice(existingPairIdx, 1);
                            }
                            const pair: ResultPair = {
                                infoId: info.id,
                                testName: test?.name,
                                expectedUri,
                                expectedResult,
                                actualUri,
                                actualResult
                            };
                            resultPairs.push(pair);
                            updateDiffDecorations(pair, expectedEditor, actualEditor);
                            // TODO set focus to expected
                            vscode.commands.executeCommand("revealLine", { lineNumber: 3, at: 'top' });
                        }
                    });
                }
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(`Error executing ply.diff: ${err.message}`);
        }
    });

    async function updateDiffDecorations(resultPair: ResultPair, expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor) {

        const diffState = context.workspaceState.get('ply-diffs') || {} as any;

        const resultDiffs: ResultDiffs[] = [];
        if (resultPair.testName) {
            resultDiffs.push({
                testId: resultPair.infoId,
                expectedStart: await resultPair.expectedResult.getStart(),
                expectedEnd: await resultPair.expectedResult.getEnd(),
                actualStart: await resultPair.actualResult.getStart(),
                actualEnd: await resultPair.actualResult.getEnd(),
                diffs: (diffState[resultPair.infoId] || []) as ply.Diff[]
            });
        }
        else {
            const testInfos = plyRoots.getTestInfosForSuite(resultPair.infoId);
            for (const actualTest of await resultPair.actualResult.includedTestNames()) {
                const testInfo = testInfos.find(ti => ti.label === actualTest);
                if (!testInfo) {
                    throw new Error(`Test info '${actualTest}' not found in suite: ${resultPair.infoId}`);
                }
                resultDiffs.push({
                    testId: testInfo.id,
                    expectedStart: await resultPair.expectedResult.getStart(testInfo.label),
                    expectedEnd: await resultPair.expectedResult.getEnd(testInfo.label),
                    actualStart: await resultPair.actualResult.getStart(testInfo.label),
                    actualEnd: await resultPair.actualResult.getEnd(testInfo.label),
                    diffs: (diffState[testInfo.id] || []) as ply.Diff[]
                });
            }
        }

        const decorator = new ResultDecorator(context);
        decorator.applyDecorations(expectedEditor, actualEditor, resultDiffs);
    }

    let timer: NodeJS.Timer | undefined = undefined;
    function delay(ms: number) {
        return new Promise(resolve => {
            timer = setTimeout(resolve, ms);
        });
    }

	async function checkUpdateDiffDecorations(editor: vscode.TextEditor) {
        let resultPair: ResultPair | undefined = undefined;
        let expectedEditor: vscode.TextEditor | undefined = undefined;
        let actualEditor: vscode.TextEditor | undefined = undefined;
        for (let i = 0; i < resultPairs.length; i++) {
            const pair = resultPairs[i];
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
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            await delay(500);
            await updateDiffDecorations(resultPair, expectedEditor, actualEditor);
        }
    }


    let activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        // checkUpdateDiffDecorations();
    }

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			checkUpdateDiffDecorations(editor);
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
            checkUpdateDiffDecorations(activeEditor);
		}
    }, null, context.subscriptions);

}

// this method is called when your extension is deactivated
export function deactivate() {
    // TODO remove diffs from workbench state
}
