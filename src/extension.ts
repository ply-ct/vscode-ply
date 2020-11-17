import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { PlyAdapter } from './adapter';
import { ResultContentProvider } from './result/content';
import { Result } from './result/result';
import { PlyRoots } from './plyRoots';
import { ResultDecorator } from './result/decorator';
import { SegmentCodeLensProvider } from './result/codeLens';
import { DiffHandler, DiffState } from './result/diff';
import { PlyConfig } from './config';
import { FlowEditor } from './flow/editor';

interface Item {
    id: string;
    uri: vscode.Uri;
    workspaceFolder: vscode.WorkspaceFolder;
}

export async function activate(context: vscode.ExtensionContext) {

    // get the Test Explorer extension
    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
    console.log(`Test Explorer extension ${testExplorerExtension ? '' : 'not '}found`);

    if (!testExplorerExtension) {
        return;
    }

    console.log('vscode-ply activating...');

    const outputChannel = vscode.window.createOutputChannel('Ply Tests');
    context.subscriptions.push(outputChannel);
    const log = new Log('ply', undefined, 'Ply Invoker');
    context.subscriptions.push(log);

    // result diffs decorator
    const decorator = new ResultDecorator(context.asAbsolutePath('.'));
    context.subscriptions.push(decorator);

    // workspace folder uri to test adapter
    const testAdapters = new Map<string, PlyAdapter>();
    // workspace folder uri to diff handler
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
            testAdapters.set(workspaceFolder.uri.toString(), adapter);
            return adapter;
        },
        log
    ));

    const submitCommand = async (...args: any[]) => {
        try {
            const item = await getItem(...args);
            console.debug('ply.submit item: ' + JSON.stringify(item));
            if (item) {
                const adapter = testAdapters.get(item.workspaceFolder.uri.toString());
                if (!adapter) {
                    throw new Error(`No test adapter found for workspace folder: ${item.workspaceFolder.uri}`);
                }
                await adapter.run([item.id], { submit: true });
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    };

    context.subscriptions.push(vscode.commands.registerCommand('ply.submit', submitCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.submit-item', submitCommand));

    // register for ply.result scheme
    const contentProvider = new ResultContentProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(Result.URI_SCHEME, contentProvider));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(change => contentProvider.update(change.document.uri)));

    // codelens for results
    vscode.languages.registerCodeLensProvider( { scheme: Result.URI_SCHEME }, new SegmentCodeLensProvider());

    const diffCommand = async (...args: any[]) => {
        try {
            const item = await getItem(...args);
            console.debug('ply.diff item: ' + JSON.stringify(item));
            if (item) {
                const diffHandler = diffHandlers.get(item.workspaceFolder.uri.toString());
                if (!diffHandler) {
                    throw new Error(`No diff handler found for workspace folder: ${item.workspaceFolder.uri}`);
                }
                await diffHandler.doDiff(item.id);
            }
        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    };

    context.subscriptions.push(vscode.commands.registerCommand('ply.diff', diffCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff-item', diffCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff.fragment-item', diffCommand));

    const openResultCommand = async (...args: any[]) => {
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
    };

    context.subscriptions.push(vscode.commands.registerCommand('ply.openResult', openResultCommand));

    const importPostmanCommand =  async (...args: any[]) => {
        try {
            let workspaceFolder: vscode.WorkspaceFolder | undefined = undefined;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length === 1) {
                workspaceFolder = workspaceFolders[0];
            }

            if (args && args.length > 0 && args[0].adapterIds && args[0].adapterIds.length > 0) {
                const id = args[0].adapterIds[0];
                if (id.startsWith('Ply:')) {
                    workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(id.substring(4)));
                }
            }

            if (!workspaceFolder) {
                workspaceFolder = await vscode.window.showWorkspaceFolderPick({
                    placeHolder: 'Select destination workspace folder',
                    ignoreFocusOut: true
                });
            }

            if (workspaceFolder) {
                const uris = await vscode.window.showOpenDialog({
                    openLabel: 'Import',
                    canSelectMany: true,
                    filters: {
                        'Postman Files': ['json', 'postman']
                    },
                    title: 'Select Postman files'
                });
                if (uris && uris.length > 0) {
                    const plyOptions = new PlyConfig(workspaceFolder, log).plyOptions;
                    const importer = new ply.Import('postman', plyOptions.testsLocation, plyOptions.prettyIndent, log);
                    for (const uri of uris) {
                        log.info(`Importing postman file ${uri.fsPath}`);
                        importer.doImport(new ply.Retrieval(uri.fsPath));
                    }
                }
            }

        } catch (err) {
            console.error(err);
            vscode.window.showErrorMessage(err.message);
        }
    };

    context.subscriptions.push(vscode.commands.registerCommand('ply.import.postman', importPostmanCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.import.postman-item', importPostmanCommand));

    /**
     * Returns a test/suite item.
     */
    async function getItem(...args: any[]): Promise<Item | undefined > {
        if (args.length === 1 && (args[0] as Item)) {
            return args[0];
        }

        let uri: vscode.Uri | undefined = undefined;
        let id: string | undefined = undefined;
        if (args.length > 0) {
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
                    'Ply Requests/Cases': ['yaml', 'yml', 'ts']
                },
                title: 'Select Ply suite'
            });
            if (uris && uris.length > 0) {
                uri = uris[0];
                id = PlyRoots.fromUri(uri);
            }
        }
        if (id && uri) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (!workspaceFolder) {
                throw new Error(`No workspace folder found for URI: ${uri}`);
            }
            return { id, uri, workspaceFolder };
        }
    }

    const flowEditor = new FlowEditor(context);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider('ply.flow.diagram', flowEditor));

    console.log('vscode-ply is active');
}

export function deactivate() {
}
