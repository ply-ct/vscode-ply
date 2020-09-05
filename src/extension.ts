import * as vscode from 'vscode';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { PlyAdapter } from './adapter';
import { ResultContentProvider } from './result/content';
import { Result } from './result/result';
import { PlyRoots } from './plyRoots';
import { ResultDecorator } from './result/decorator';
import { SegmentCodeLensProvider } from './result/codeLens';
import { DiffHandler, DiffState } from './result/diff';

export async function activate(context: vscode.ExtensionContext) {

    // get the Test Explorer extension
    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
    console.log(`Test Explorer extension ${testExplorerExtension ? '' : 'not '}found`);

    if (!testExplorerExtension) {
        return;
    }

    console.log('vscode-ply is active');

    const outputChannel = vscode.window.createOutputChannel('Ply Tests');
    context.subscriptions.push(outputChannel);
    const log = new Log('ply', undefined, 'Ply Invoker');
    context.subscriptions.push(log);

    // result diffs decorator
    const decorator = new ResultDecorator(context.asAbsolutePath('.'));
    context.subscriptions.push(decorator);

    // workspace folder uri to PlyRoots
    const diffHandlers = new Map<string, DiffHandler>();

    // register PlyAdapter and DiffHandler for each WorkspaceFolder
    context.subscriptions.push(new TestAdapterRegistrar(
        testExplorerExtension.exports,
        workspaceFolder => {
            // TODO dispose plyRoots and diffHandlers in onDidChangeWorkspaceFolders
            const plyRoots = new PlyRoots(workspaceFolder.uri);
            context.subscriptions.push(plyRoots);
            const diffState = new DiffState(workspaceFolder, context.workspaceState);
            let adapter: PlyAdapter | undefined = undefined;
            const retire = (testIds: string[]) => adapter?.retireIds(testIds);
            const diffHandler = new DiffHandler(workspaceFolder, plyRoots, diffState, decorator, retire, log);
            context.subscriptions.push(diffHandler);
            diffHandlers.set(workspaceFolder.uri.toString(), diffHandler);
            adapter = new PlyAdapter(workspaceFolder, plyRoots, diffState, outputChannel, log);
            return adapter;
        },
        log
    ));

    // register for ply.result scheme
    const contentProvider = new ResultContentProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(Result.URI_SCHEME, contentProvider));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(change => contentProvider.update(change.document.uri)));

    // codelens for results
    vscode.languages.registerCodeLensProvider( { scheme: Result.URI_SCHEME }, new SegmentCodeLensProvider());

    const diffCommand = async (...args: any[]) => {
        try {
            let uri: vscode.Uri | undefined = undefined;
            let id: string | undefined = undefined;
            if (args && args.length > 0) {
                const node = args[0];
                if (node.adapterIds && node.adapterIds.length > 0) {
                    id = node.adapterIds[0];
                    if (id) {
                        uri = PlyRoots.toUri(id);
                    }
                }
            } else {
                const uris = await vscode.window.showOpenDialog({
                    openLabel: 'Select',
                    canSelectMany: false,
                    filters: {
                        'Ply Requests': ['yaml', 'yml'],
                        'Ply Cases': ['ts']
                    },
                    title: 'Select Ply suite'
                });
                if (uris && uris.length > 0) {
                    uri = uris[0];
                    id = PlyRoots.fromUri(uri);
                }
            }

            log.debug(`ply.diff item uri: ${uri}`);
            if (uri) {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (!workspaceFolder) {
                    throw new Error(`No workspace folder found for URI: ${uri}`);
                }
                const diffHandler = diffHandlers.get(workspaceFolder.uri.toString());
                if (!diffHandler) {
                    throw new Error(`No diff handler found for workspace folder: ${workspaceFolder.uri}`);
                }
                if (id) {  // id must be assigned if uri is
                    await diffHandler.doDiff(id);
                }
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    };

    context.subscriptions.push(vscode.commands.registerCommand('ply.diff', diffCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff.fragment', diffCommand));

    context.subscriptions.push(vscode.commands.registerCommand('ply.openResult', async (...args: any[]) => {
        try {
            const uri = args[0] as vscode.Uri;
            if (uri && uri.scheme === Result.URI_SCHEME && uri.fragment) {
                const fileUri = Result.convertUri(uri);
                const plyResult = Result.fromUri(uri);
                const lineNumber = await plyResult.getStart(plyResult.testName);
                if (args.length > 0 && args[1] === true) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
                    if (workspaceFolder) {
                        const diffHandler = diffHandlers.get(workspaceFolder.uri.toString());
                        if (diffHandler) {
                            let suiteId = diffHandler.plyRoots.getSuiteIdForExpectedResult(fileUri);
                            if (!suiteId) {
                                suiteId = diffHandler.plyRoots.getSuiteIdForActualResult(fileUri);
                            }
                            if (suiteId) {
                                await diffHandler.doDiff(suiteId);
                            }
                        }
                    }
                } else {
                    await vscode.commands.executeCommand('vscode.open', fileUri);
                }
                // go to line number
                const editor = vscode.window.visibleTextEditors.find(editor => {
                    let docUri = editor.document.uri;
                    if (docUri.scheme === Result.URI_SCHEME) {
                        // when codelens is 'Compare result files' clicked in actual, scheme is ply-result;
                        // so convert to file uri
                        docUri = Result.convertUri(editor.document.uri);
                    }
                    return docUri.toString() === fileUri.toString();
                });
                if (editor) {
                    await vscode.commands.executeCommand("revealLine", { lineNumber, at: 'top' });
                }
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('ply.import.postman', async (...args: any[]) => {
        try {
            vscode.window.showInformationMessage('Import Postman');
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }

    }));

}

export function deactivate() {
}
