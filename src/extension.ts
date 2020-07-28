import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';
import { PlyAdapter } from './adapter';
import { ResultContentProvider } from './result/content';
import { Result } from './result/result';
import { PlyConfig } from './config';
import { PlyRoots } from './plyRoots';
import { ResultDiffs, ResultDecorator } from './result/decorator';
import { ResultCodeLensProvider } from './result/codeLens';


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

    const outputChannel = vscode.window.createOutputChannel('Ply Tests');
    const log = new Log('ply', undefined, 'Ply Invoker');
    context.subscriptions.push(log);

    const workspacePlyRoots = new Map<vscode.WorkspaceFolder, PlyRoots>();
    function getPlyRoots(uri: vscode.Uri): PlyRoots | undefined {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (workspaceFolder) {
            return workspacePlyRoots.get(workspaceFolder);
        }
    }

    // register PlyAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
        testExplorerExtension.exports,
        workspaceFolder => {
            const config = new PlyConfig(workspaceFolder, log);
            const plyRoots = new PlyRoots(workspaceFolder.uri);
            workspacePlyRoots.set(workspaceFolder, plyRoots);
            // clear previous diff state
            context.workspaceState.update(`ply-diffs:${workspaceFolder.uri}`, undefined);
            // listen for config changes
            context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(config.onChange));
            return new PlyAdapter(workspaceFolder, context.workspaceState, outputChannel, config, plyRoots, log);
        },
        log
    ));

    // register for ply.result scheme
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(Result.URI_SCHEME, new ResultContentProvider()));
    // codelens for results
    // vscode.languages.registerCodeLensProvider({ scheme: Result.URI_SCHEME }, new ResultCodeLensProvider());
    vscode.workspace.getConfiguration().update('ply.logpanel', true, vscode.ConfigurationTarget.WorkspaceFolder);
    vscode.languages.registerCodeLensProvider( { scheme: Result.URI_SCHEME }, new ResultCodeLensProvider());
    // result diffs decorator
    const resultPairs: ResultPair[] = [];
    const decorator = new ResultDecorator(context.asAbsolutePath('.'));

    context.subscriptions.push(vscode.commands.registerCommand('ply.diff', async (...args: any[]) => {
        try {
            if (args.length) {
                const node = args[0];
                if (node.adapterIds) {
                    const id = node.adapterIds[0];  // suiteId is file uri
                    log.debug(`ply.diff item id: ${id}`);
                    // TODO handle remote ids
                    const plyRoots = getPlyRoots(PlyRoots.toUri(id));
                    if (!plyRoots) {
                        // could be a suite/test from another adapter (eg: mocha)
                        log.warn(`Ply test info not found for id: ${id} (not a ply test?)`);
                        return;
                    }

                    const info = plyRoots.findTestOrSuiteInfo(id);
                    if (!info) {
                        // could be a suite/test from another adapter (eg: mocha)
                        log.warn(`Ply test info not found for id: ${id} (not a ply test?)`);
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
                        }
                    });
                }
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(`Error executing ply.diff: ${err.message}`);
        }
    }));

    /**
     * Applies decorations only if diff state exists for the pair
     */
    async function updateDiffDecorations(resultPair: ResultPair,
        expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor) {

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(expectedEditor.document.uri);
        const diffState = context.workspaceState.get(`ply-diffs:${workspaceFolder?.uri}`) || {} as any;

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
            const plyRoots = getPlyRoots(resultPair.expectedUri);
            if (plyRoots) {
                const testInfos = plyRoots.getTestInfosForSuite(resultPair.infoId);
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
        }

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

export function deactivate() {
}
