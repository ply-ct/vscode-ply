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
            if (args.length) {
                const node = args[0];
                if (node.adapterIds) {
                    const id = node.adapterIds[0];
                    log.debug(`ply.diff item id: ${id}`);
                    const uri = PlyRoots.toUri(id);
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                    if (!workspaceFolder) {
                        throw new Error(`No workspace folder found for URI: ${uri}`);
                    }
                    const diffHandler = diffHandlers.get(workspaceFolder.uri.toString());
                    if (!diffHandler) {
                        throw new Error(`No diff handler found for workspace folder: ${workspaceFolder.uri}`);
                    }
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
        const uri = args[0] as vscode.Uri;
        if (uri.scheme === Result.URI_SCHEME && uri.fragment) {
            const fileUri = Result.convertUri(uri);
            const plyResult = Result.fromUri(uri);
            const lineNumber = await plyResult.getStart(plyResult.testName);
            await vscode.commands.executeCommand('vscode.open', fileUri);
            // go to line number
            const editor = vscode.window.visibleTextEditors.find(editor => {
                return editor.document.uri.toString() === fileUri.toString();
            });
            if (editor) {
                vscode.commands.executeCommand("revealLine", { lineNumber, at: 'top' });
            }
        }
    }));
}

export function deactivate() {
}
