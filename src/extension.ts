import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { PlyAdapter } from './adapter';
import { PlyResultContentProvider } from './result/provider';
import { PlyConfig } from './config';
import { PlyRoots } from './plyRoots';
import { Decorations } from './decorations';
import {existsSync as exists, writeFileSync as write} from 'fs';
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

    const provider = new PlyResultContentProvider();

    // register content provider for scheme `references`
    // register document link provider for scheme `references`
    const providerRegistrations = vscode.Disposable.from(
        vscode.workspace.registerTextDocumentContentProvider(PlyResultContentProvider.scheme, provider)
    );

    let disposable = vscode.commands.registerCommand('ply.diff', (...args: any[]) => {

        if (args.length) {
            const node = args[0];
            if (node.adapterIds) {
                let suiteId = node.adapterIds[0];  // suiteId is file uri
                log.debug('ply.diff suiteId: ' + suiteId);

                var test;
                const testInfo = plyRoots.findFirstTestInfo(suiteId);
                if (testInfo) {
                    test = plyRoots.getTest(testInfo.id);
                }
                if (!test) {
                    throw new Error("Plyee not found for suite: " + suiteId);
                }

                // if (plyee.actual.exists()) {
                //     const actualUri = vscode.Uri.file(plyee.actual.toString());
                //     const expected = plyee.expected.toString();
                //     const expectedUri = plyee.expected.isUrl() ? vscode.Uri.parse(expected) : vscode.Uri.file(expected);
                //     if (!exists(expectedUri.fsPath)) {
                //         // create empty expected result file
                //         write(expectedUri.fsPath, '', 'utf-8');
                //     }
                //     vscode.commands.executeCommand('vscode.diff', expectedUri, actualUri).then(() => {
                //         checkUpdateDecorations();
                //     });
                // } else {
                //     // TODO suppress show diff if actual result does not exist
                //     vscode.window.showErrorMessage("Result does not exist: " + plyee.actual);
                // }
            }
        }
    });

    let timeout: NodeJS.Timer | undefined = undefined;

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
