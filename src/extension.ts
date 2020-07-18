import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import * as ply from 'ply-ct';
import { PlyAdapter } from './adapter';
import { ResultContentProvider } from './result/provider';
import { Result } from './result/result';
import { PlyConfig } from './config';
import { PlyRoots } from './plyRoots';
import { Decorations } from './decorations';
import { ResultDiffs, ResultDecorator } from './result/decorator';
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
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(
        Result.URI_SCHEME, resultContentProvider));

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
                        vscode.window.showErrorMessage(`Expected result not found: ${expectedLabel}`);
                        return;
                    }
                    const expectedTests = await expectedResult.includedTestNames();
                    let expectedUri = expectedResult.toUri();

                    const actual = suite.runtime.results.actual;
                    const actualResult = new Result(actual, test?.name);
                    let actualLabel = actualResult.label;
                    const actualTests = await actualResult.includedTestNames();
                    let actualUri = actualResult.toUri();

                    let useFsUri = !test; // use (editable) file system uri for suite
                    if (test) {
                        // other condition: expected actual test names are the same as actual
                        if (expectedTests.length === actualTests.length) {
                            useFsUri = expectedTests.every(expectedTest => actualTests.includes(expectedTest));
                        }
                    }

                    if (useFsUri) {
                        expectedUri = Result.convertUri(expectedUri);
                        actualUri = Result.convertUri(actualUri);
                    }
                    else {
                        // expected is read-only virtual file
                        expectedLabel = `(read only) ${expectedResult.plyResult.location.name}#${test?.name}`;
                        actualLabel = `${expectedResult.plyResult.location.name}#${test?.name}`;
                    }
                    if (!(await actualResult.exists())) {
                        actualLabel = `(not found) ${actualLabel}`;
                    }

                    const title = `${expectedLabel} ⟷ ${actualLabel}`;
                    const options: vscode.TextDocumentShowOptions = {
                        preserveFocus: true,
                        preview: true
                    };

                    const resultDiffs: ResultDiffs[] = [];
                    if (test) {
                        const testDiffs = context.workspaceState.get(`diffs~${info.id}`);
                        if (testDiffs) {
                            resultDiffs.push({
                                testId: info.id,
                                start: useFsUri ? (await actualResult.getStart(info.label)) : 0,
                                end: useFsUri ? (await actualResult.getEnd(info.label)) : 0, // TODO end is resultcontents end
                                diffs: (testDiffs || []) as ply.Diff[]
                            });
                        }
                    }
                    else {
                        const testInfos = plyRoots.getTestInfosForSuite(info.id);
                        for (const actualTest of actualTests) {
                            const testInfo = testInfos.find(ti => ti.label === actualTest);
                            if (!testInfo) {
                                throw new Error(`Test info '${actualTest}' not found in suite: ${info.id}`);
                            }
                            const testDiffs = context.workspaceState.get(`diffs~${testInfo.id}`);
                            resultDiffs.push({
                                testId: testInfo.id,
                                start: await actualResult.getStart(testInfo.label),
                                end: await actualResult.getEnd(testInfo.label),
                                diffs: (testDiffs || []) as ply.Diff[]
                            });
                        }
                    }

//                    console.log("RESULT DIFFS: " + JSON.stringify(resultDiffs, null, 2));


                    vscode.commands.executeCommand('vscode.diff', expectedUri, actualUri, title, options).then(() => {
                        const expectedEditor = vscode.window.visibleTextEditors.find(ed => ed.document.uri.toString() === expectedUri.toString());
                        const actualEditor = vscode.window.visibleTextEditors.find((ed => ed.document.uri.toString() === actualUri.toString()));

                        const decorator = new ResultDecorator();
                        if (expectedEditor && actualEditor) {
                            decorator.applyDecorations(expectedEditor, actualEditor, resultDiffs, true);
                        }

                        // TODO decorations
                        // checkUpdateDecorations();



                        // TODO lineNumber should be either test top or first diff (hardcoded to line 3 now)
                        // vscode.commands.executeCommand("revealLine", { lineNumber: 2, at: 'top' });
                    });

                }
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(`Error executing ply.diff: ${err.message}`);
        }
    });

    const timeout: NodeJS.Timer | undefined = undefined;

    function checkUpdateDecorations() {

        let plyExpectedEditor: vscode.TextEditor | undefined;
        let plyActualEditor: vscode.TextEditor | undefined;
        for (const editor of vscode.window.visibleTextEditors) {
            if (!editor.viewColumn && editor.document.uri.scheme === 'file') {
                // could be diff editor
                // console.log("fsPath: " + editor.document.uri.fsPath);

            }
        }


		// if (timeout) {
		// 	clearTimeout(timeout);
		// 	timeout = undefined;
		// }
		// timeout = setTimeout(updateDecorations, 500);
	}

    function updateDecorations() {

        // const dec1 = { range: new vscode.Range(new vscode.Position(2, 10), new vscode.Position(2, 37)) };
        // const dec2 = { range: new vscode.Range(new vscode.Position(2, 45), new vscode.Position(2, 53)) };

        // plyActualEditor.setDecorations(Decorations.matchHighlight, [dec1, dec2]);
    }

    // vscode.window.onDidChangeActiveTextEditor(editor => {
    //     console.log("ED: " + editor);
    // });

    vscode.window.onDidChangeVisibleTextEditors(() => {
        checkUpdateDecorations();
    });

    // vscode.workspace.onDidChangeTextDocument(event => {
	// 	if (plyExpectedEditor && event.document === plyExpectedEditor.document) {
	// 		triggerUpdateDecorations();
	// 	}
    // }, null, context.subscriptions);

    vscode.workspace.onDidCloseTextDocument(document => {

    });
}

// this method is called when your extension is deactivated
export function deactivate() {

}
