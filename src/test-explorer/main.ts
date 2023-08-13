import * as vscode from 'vscode';
import { TestHub as ITestHub } from '../test-adapter/api/index';
import { TestHub } from './hub/testHub';
import { PlyExplorer } from '../ply-explorer';
import { runTestsInFile, runTestAtCursor, debugTestAtCursor, debugTestsInFile } from './util';

export function activate(context: vscode.ExtensionContext): ITestHub {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceUri =
        workspaceFolders !== undefined && workspaceFolders.length > 0
            ? workspaceFolders[0].uri
            : undefined;
    const configuration = vscode.workspace.getConfiguration('ply.explorer', workspaceUri);
    const addToEditorContextMenu = configuration.get<boolean>('addToEditorContextMenu');

    const hub = new TestHub();
    const plyExplorer = new PlyExplorer(context);
    hub.registerTestController(plyExplorer);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((configChange) => {
            if (configChange.affectsConfiguration('ply.explorer.addToEditorContextMenu')) {
                const configuration = vscode.workspace.getConfiguration(
                    'testExplorer',
                    workspaceUri
                );
                const addToEditorContextMenu = configuration.get<boolean>('addToEditorContextMenu');
                vscode.commands.executeCommand(
                    'setContext',
                    'showTestExplorerEditorContextMenu',
                    addToEditorContextMenu
                );
            }
        })
    );

    vscode.commands.executeCommand(
        'setContext',
        'showTestExplorerEditorContextMenu',
        addToEditorContextMenu
    );

    const explorerTreeView = vscode.window.createTreeView('ply-tests', {
        treeDataProvider: plyExplorer,
        showCollapseAll: true,
        canSelectMany: true
    });
    context.subscriptions.push(explorerTreeView);

    const documentSelector = { scheme: '*', pattern: '**/*' };
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, plyExplorer)
    );
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(documentSelector, plyExplorer)
    );

    const registerCommand = (command: string, callback: (...args: any[]) => any) => {
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    };

    registerCommand('ply.explorer.run-all', () => plyExplorer.run());

    registerCommand('ply.explorer.run', (clickedNode, allNodes) =>
        plyExplorer.run(allNodes || [clickedNode], false)
    );

    registerCommand('ply.explorer.pick-and-run', (nodes) => plyExplorer.run(nodes, true));

    registerCommand('ply.explorer.rerun', () => plyExplorer.rerun());

    registerCommand('ply.explorer.run-file', (file?: string) => runTestsInFile(file, plyExplorer));

    registerCommand('ply.explorer.run-test-at-cursor', () => runTestAtCursor(plyExplorer));

    registerCommand('ply.explorer.run-this-file', (fileUri: vscode.Uri) =>
        runTestsInFile(fileUri.toString(), plyExplorer)
    );

    registerCommand('ply.explorer.run-this-test', () => runTestAtCursor(plyExplorer));

    registerCommand('ply.explorer.debug-all', () => plyExplorer.debug());

    registerCommand('ply.explorer.debug', (clickedNode, allNodes) =>
        plyExplorer.debug(allNodes || [clickedNode], false)
    );

    registerCommand('ply.explorer.pick-and-debug', (nodes) => plyExplorer.debug(nodes, true));

    registerCommand('ply.explorer.redebug', () => plyExplorer.redebug());

    registerCommand('ply.explorer.debug-file', (file?: string) =>
        debugTestsInFile(file, plyExplorer)
    );

    registerCommand('ply.explorer.debug-test-at-cursor', () => debugTestAtCursor(plyExplorer));

    registerCommand('ply.explorer.debug-this-test', () => debugTestAtCursor(plyExplorer));

    registerCommand('ply.explorer.cancel', () => plyExplorer.cancel());

    registerCommand('ply.explorer.reload', () => plyExplorer.reload());

    registerCommand('ply.explorer.reload-collection', (node) => plyExplorer.reload(node));

    registerCommand('ply.explorer.reloading', () => {});

    registerCommand('ply.explorer.show-log', (nodes) => plyExplorer.showLog(nodes));

    registerCommand('ply.explorer.show-error', (message) => plyExplorer.showError(message));

    registerCommand('ply.explorer.show-source', (node) => plyExplorer.showSource(node, false));

    registerCommand('ply.explorer.enable-autorun', (node) => plyExplorer.setAutorun(node));

    registerCommand('ply.explorer.disable-autorun', (node) => plyExplorer.clearAutorun(node));

    registerCommand('ply.explorer.reveal', (node) => plyExplorer.reveal(node, explorerTreeView));

    return {
        registerTestAdapter: (adapter) => hub.registerTestAdapter(adapter),
        unregisterTestAdapter: (adapter) => hub.unregisterTestAdapter(adapter),
        registerTestController: (controller) => hub.registerTestController(controller),
        unregisterTestController: (controller) => hub.unregisterTestController(controller)
    };
}
