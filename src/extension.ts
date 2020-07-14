import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { PlyAdapter } from './adapter';
import { PlyResultContentProvider, PlyResultUri } from './result/provider';
import { PlyConfig } from './config';
import { PlyRoots } from './plyRoots';
import { Decorations } from './decorations';
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
    // register PlyTestAdapter for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
        testHub,
        workspaceFolder => new PlyAdapter(workspaceFolder, outputChannel, plyRoots, log),
        log
    ));

    // register for ply.result scheme
    const resultContentProvider = new PlyResultContentProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(
        PlyResultUri.SCHEME, resultContentProvider));

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
                    const expectedPlyUri = new PlyResultUri(expected, test?.name);
                    const expectedUri = expectedPlyUri.toUri();
                    const expectedLabel = expectedPlyUri.label(workspaceFolder.uri.fsPath);
                    if (!(await expectedPlyUri.exists())) {
                        vscode.window.showErrorMessage(`Expected result not found: ${expectedLabel}`);
                        return;
                    }

                    const actual = suite.runtime.results.actual;
                    const actualPlyUri = new PlyResultUri(actual, test?.name);
                    const actualUri = actualPlyUri.toUri();
                    let actualLabel = actualPlyUri.label(workspaceFolder.uri.fsPath);
                    if (!(await actualPlyUri.exists())) {
                        actualLabel = `(not found) ${actualLabel}`;
                    }

                    const title = `${expectedLabel} ⟷ ${actualLabel}`;
                    // TODO location in file based on test
                    vscode.commands.executeCommand('vscode.diff', expectedUri, actualUri, title).then(() => {
                        // checkUpdateDecorations();
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
                console.log("fsPath: " + editor.document.uri.fsPath);

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
