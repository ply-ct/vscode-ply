import * as vscode from 'vscode';
import { TypedEvent as Event, Listener, Disposable } from '@ply-ct/ply-api';
import { TestHub } from './test-adapter/api/index';
import { activate as plyExplorerActivate } from './test-explorer/main';
import { Log } from './test-adapter/util/log';
import { TestAdapterRegistrar } from './test-adapter/util/registrar';
import { PlyAdapter } from './adapter';
import { Result } from './result/result';
import { PlyRoots } from './ply-roots';
import { ResultDecorator } from './result/decorator';
import { SegmentCodeLensProvider } from './result/codeLens';
import { DiffHandler, DiffState } from './result/diff';
import { RequestActionEvent, RequestEditor } from './edit/request';
import { FlowEditor, FlowActionEvent, FlowItemSelectEvent, FlowModeChangeEvent } from './edit/flow';
import { Importer } from './import';
import { PlyItem } from './item';
import { AdapterHelper } from './adapter-helper';
import { RequestFs } from './request/request-fs';
import { ResultFragmentFs } from './result/result-fs';
import { VizEditor } from './edit/viz';
import { PlyExplorerDecorationProvider } from './decorations';
import { PlyValuesTree } from './values/values-tree';
import { PlyConfig } from './config';
import { ExpectedResultsDecorator } from './result/expected';

export async function activate(context: vscode.ExtensionContext) {
    const before = Date.now();
    console.log('vscode-ply activating...');

    // DiffHandler.closeAllDiffEditors();

    const testHub: TestHub = plyExplorerActivate(context);

    const outputChannel = vscode.window.createOutputChannel('Ply');
    context.subscriptions.push(outputChannel);
    const log = new Log('ply', undefined, 'Ply Invoker');
    context.subscriptions.push(log);

    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(new PlyExplorerDecorationProvider())
    );

    // result diffs decorator
    const decorator = new ResultDecorator(context.asAbsolutePath('.'));
    context.subscriptions.push(decorator);

    // workspace folder uri to test adapter
    const testAdapters = new Map<string, PlyAdapter>();
    // workspace folder uri to diff handler
    const diffHandlers = new Map<string, DiffHandler>();

    const _onRequestAction = new Event<RequestActionEvent>();
    const onRequestAction = (listener: Listener<RequestActionEvent>): Disposable => {
        return _onRequestAction.on(listener);
    };

    const _onFlowAction = new Event<FlowActionEvent>();
    const onFlowAction = (listener: Listener<FlowActionEvent>): Disposable => {
        return _onFlowAction.on(listener);
    };
    const _onFlowItemSelect = new Event<FlowItemSelectEvent>();
    const onFlowItemSelect = (listener: Listener<FlowItemSelectEvent>): Disposable => {
        return _onFlowItemSelect.on(listener);
    };
    const _onFlowModeChange = new Event<FlowModeChangeEvent>();
    const onFlowModeChange = (listener: Listener<FlowModeChangeEvent>): Disposable => {
        return _onFlowModeChange.on(listener);
    };

    const requestEditor = new RequestEditor(
        context,
        new AdapterHelper(testAdapters),
        onRequestAction
    );
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('ply.request', requestEditor, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // register for ply-request scheme
    const requestFs = new RequestFs();
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(RequestFs.URI_SCHEME, requestFs, {
            isCaseSensitive: true
        })
    );

    // open request in custom editor
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.open-request', async (...args: any[]) => {
            let uri =
                typeof args[0] === 'string'
                    ? vscode.Uri.parse(args[0]).with({ fragment: '' })
                    : args[0].uri;
            if (typeof args[0].runNumber === 'number') {
                uri = uri.with({ query: `runNumber=${args[0].runNumber}` });
            }
            if (uri.path.endsWith('.ply')) {
                // honor preview if possible
                vscode.commands.executeCommand('vscode.open', uri, { preview: args[0].preview });
            } else {
                // eg: my-requests.ply.yaml#Request1 -- cannot honor preview
                // https://github.com/microsoft/vscode/issues/123360
                vscode.commands.executeCommand('vscode.openWith', uri, 'ply.request');
            }
        })
    );

    const flowEditor = new FlowEditor(
        context,
        new AdapterHelper(testAdapters),
        onFlowItemSelect,
        onFlowAction,
        onFlowModeChange
    );

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('ply.flow.diagram', flowEditor)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.open-flow', async (...args: any[]) => {
            // hack for runner callback to avoid breaking something
            const callback = args.length > 1 && typeof args[1] === 'function' ? args[1] : null;
            const item = callback ? await PlyItem.getItem(args[0]) : await PlyItem.getItem(...args);
            if (item?.uri) {
                const fileUri = vscode.Uri.file(item.uri.fsPath);
                if (item.uri.fragment) {
                    flowEditor.onceWebviewReady = () => {
                        _onFlowItemSelect.emit({ uri: item.uri });
                    };
                }
                if (callback) {
                    flowEditor.onceWebviewReady = async (uri) => {
                        if (uri.toString() === fileUri.toString()) {
                            await callback();
                        }
                    };
                }
                await vscode.commands.executeCommand('vscode.open', fileUri, {
                    preview: args[0].preview
                });
                if (item.uri.fragment) {
                    _onFlowItemSelect.emit({ uri: item.uri });
                }
                return fileUri;
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow.configurator', async () => {
            _onFlowAction.emit({
                uri: vscode.Uri.file('/'),
                action: 'configurator',
                options: { state: 'open' }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow.source-to-side', async (uri) => {
            const textDoc = await vscode.workspace.openTextDocument(uri);
            _onFlowAction.emit({ uri, action: 'toolbox', options: { state: 'closed' } });
            vscode.window.showTextDocument(textDoc, vscode.ViewColumn.Beside, true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow-action', async (...args: any[]) => {
            const item = await PlyItem.getItem(args[0]);
            if (item?.uri) {
                _onFlowAction.emit({ uri: item.uri, action: args[1], options: args[2] });
            }
        })
    );
    const setFlowMode = (mode: any) => {
        _onFlowModeChange.emit({ mode });
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow.mode.select', () => setFlowMode('select'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow.mode.connect', () => setFlowMode('connect'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow.mode.inspect', () => setFlowMode('runtime'))
    );

    const vizEditor = new VizEditor(context, new AdapterHelper(testAdapters));
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('ply.viz', vizEditor, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ply.visualize', async (...args: any[]) => {
            const item = await PlyItem.getItem(...args);
            if (item) {
                vscode.commands.executeCommand('vscode.openWith', item.uri, 'ply.viz');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ply.open-cases', async (...args: any[]) => {
            const item = await PlyItem.getItem(...args);
            if (item?.uri) {
                const fileUri = vscode.Uri.file(item.uri.fsPath);
                const doc = await vscode.workspace.openTextDocument(fileUri);
                vscode.window.showTextDocument(doc);
                return fileUri;
            }
        })
    );

    // new test commands
    context.subscriptions.push(new PlyItem(context).command);
    context.subscriptions.push(new PlyItem(context, 'request').command);
    context.subscriptions.push(new PlyItem(context, 'case').command);
    context.subscriptions.push(new PlyItem(context, 'flow').command);

    // register PlyAdapter and DiffHandler for each WorkspaceFolder
    context.subscriptions.push(
        new TestAdapterRegistrar(
            testHub,
            (workspaceFolder) => {
                // TODO dispose plyRoots and diffHandlers in onDidChangeWorkspaceFolders
                const plyRoots = new PlyRoots(
                    workspaceFolder.uri,
                    vscode.Uri.file(new PlyConfig(workspaceFolder).plyOptions.testsLocation)
                );
                context.subscriptions.push(plyRoots);
                const diffState = new DiffState(workspaceFolder, context.workspaceState);
                const adapter = new PlyAdapter(
                    workspaceFolder,
                    plyRoots,
                    diffState,
                    outputChannel,
                    log
                );
                const retire = (testIds: string[]) => adapter.retireIds(testIds);
                const diffHandler = new DiffHandler(adapter, diffState, decorator, retire);
                context.subscriptions.push(diffHandler);
                diffHandlers.set(workspaceFolder.uri.toString(), diffHandler);

                context.subscriptions.push(new ExpectedResultsDecorator(workspaceFolder, adapter));

                testAdapters.set(workspaceFolder.uri.toString(), adapter);
                adapter.onceValues((valuesEvent) => {
                    vscode.commands.executeCommand('setContext', 'ply.showValuesTree', true);
                    new PlyValuesTree(context, valuesEvent.values, log);
                });
                return adapter;
            },
            log
        )
    );

    const submitCommand = async (...args: any[]) => {
        try {
            const item = await PlyItem.getItem(...args);
            console.debug('ply.submit item: ' + JSON.stringify(item));
            if (item) {
                const adapter = testAdapters.get(item.workspaceFolder.uri.toString());
                if (!adapter) {
                    throw new Error(
                        `No test adapter found for workspace folder: ${item.workspaceFolder.uri}`
                    );
                }
                if (adapter.plyRoots.find((i) => i.id === item.id)) {
                    await adapter.run([item.id], { submit: true });
                } else {
                    throw new Error(`Ply test info not found for id: ${item.id} (not a ply test?)`);
                }
            }
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('ply.submit', submitCommand));

    const resultFs = new ResultFragmentFs();
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(Result.URI_SCHEME, resultFs, {
            isCaseSensitive: true
        })
    );

    // codelens for results
    vscode.languages.registerCodeLensProvider(
        { scheme: Result.URI_SCHEME },
        new SegmentCodeLensProvider()
    );

    const diffCommand = async (...args: any[]) => {
        try {
            const item = await PlyItem.getItem(...args);
            console.debug('ply.diff item: ' + JSON.stringify(item));
            if (item) {
                const diffHandler = diffHandlers.get(item.workspaceFolder.uri.toString());
                if (!diffHandler) {
                    throw new Error(
                        `No diff handler found for workspace folder: ${item.workspaceFolder.uri}`
                    );
                }
                const info = diffHandler.adapter.plyRoots.findInfo(item.id);
                if (info) {
                    await diffHandler.doDiff(info);
                } else {
                    throw new Error(`Ply test info not found for id: ${item.id} (not a ply test?)`);
                }
            }
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff', diffCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff.fragment', diffCommand));

    const openResultCommand = async (...args: any[]) => {
        try {
            const uri = args[0] as vscode.Uri;
            if (uri && uri.scheme === Result.URI_SCHEME) {
                const fileUri = Result.convertUri(uri);
                const plyResult = Result.fromUri(uri);
                const lineNumber = await plyResult.getStart(plyResult.testName);
                if (args.length > 0 && args[1] === true) {
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
                    if (workspaceFolder) {
                        const diffHandler = diffHandlers.get(workspaceFolder.uri.toString());
                        if (diffHandler) {
                            let suiteId =
                                diffHandler.adapter.plyRoots.getSuiteIdForExpectedResult(fileUri);
                            if (!suiteId) {
                                suiteId =
                                    diffHandler.adapter.plyRoots.getSuiteIdForActualResult(fileUri);
                            }
                            if (suiteId) {
                                const info = diffHandler.adapter.plyRoots.findInfo(suiteId);
                                if (info) {
                                    await diffHandler.doDiff(info);
                                }
                            }
                        }
                    }
                } else {
                    await vscode.commands.executeCommand('vscode.open', fileUri);
                }
                // go to line number
                const editor = vscode.window.visibleTextEditors.find((editor) => {
                    let docUri = editor.document.uri;
                    if (docUri.scheme === Result.URI_SCHEME) {
                        // when codelens is 'Compare result files' clicked in actual, scheme is ply-result;
                        // so convert to file uri
                        docUri = Result.convertUri(editor.document.uri);
                    }
                    return docUri.toString() === fileUri.toString();
                });
                if (editor) {
                    await vscode.commands.executeCommand('revealLine', { lineNumber, at: 'top' });
                }
            }
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
        }
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.openResult', openResultCommand)
    );

    // postman/insomnia import
    const importer = new Importer(log);
    const importPostmanCommand = async (...args: any[]) => await importer.import('postman', args);
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.import.postman', importPostmanCommand)
    );
    const importInsomniaCommand = async (...args: any[]) => await importer.import('insomnia', args);
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.import.insomnia', importInsomniaCommand)
    );

    const after = Date.now() - before;
    console.log(`vscode-ply activated in ${after} ms`);
    log.info(`vscode-ply activated in ${after} ms`);

    const toOpen = context.workspaceState.get('ply.to.open');
    if (toOpen) {
        context.workspaceState.update('ply.to.open', undefined);
        const uri = vscode.Uri.parse('' + toOpen);
        if (uri.path.endsWith('.ply')) {
            vscode.commands.executeCommand('ply.open-request', { uri });
        } else if (uri.path.endsWith('.flow')) {
            vscode.commands.executeCommand('ply.open-flow', { uri });
        } else {
            const doc = await vscode.workspace.openTextDocument(uri);
            vscode.window.showTextDocument(doc);
        }
    }

    // plyconfig.json supports comments
    if (vscode.workspace.workspaceFolders) {
        await PlyConfig.setFileAssociations({ 'plyconfig.json': 'jsonc' });
    }
}
