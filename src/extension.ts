import * as vscode from 'vscode';
import { TypedEvent as Event, Listener, Disposable } from 'flowbee';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { PlyAdapter } from './adapter';
import { Result } from './result/result';
import { PlyRoots } from './plyRoots';
import { ResultDecorator } from './result/decorator';
import { SegmentCodeLensProvider } from './result/codeLens';
import { DiffHandler, DiffState } from './result/diff';
import { RequestActionEvent, RequestEditor } from './edit/request';
import {
    FlowEditor,
    FlowActionEvent,
    FlowItemSelectEvent,
    FlowModeChangeEvent,
    FlowConfiguratorOpen
} from './edit/flow';
import { Importer } from './import';
import { PlyItem } from './item';
import { AdapterHelper } from './adapterHelper';
import { RequestFs } from './request/request-fs';
import { ResultFragmentFs } from './result/result-fs';
import { VizEditor } from './edit/viz';

export async function activate(context: vscode.ExtensionContext) {
    const before = Date.now();

    // get the Test Explorer extension
    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
    console.log(`Test Explorer extension ${testExplorerExtension ? '' : 'not '}found`);

    if (!testExplorerExtension) {
        return;
    }

    console.log('vscode-ply activating...');

    const outputChannel = vscode.window.createOutputChannel('Ply');
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
    const _onFlowConfiguratorOpen = new Event<FlowConfiguratorOpen>();
    const onFlowConfiguratorOpen = (listener: Listener<FlowConfiguratorOpen>): Disposable => {
        return _onFlowConfiguratorOpen.on(listener);
    };

    const openEditor = async (fileUri: vscode.Uri, lineNumber?: number) => {
        await vscode.commands.executeCommand('vscode.open', fileUri);
        if (lineNumber) {
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
    };

    const requestEditor = new RequestEditor(
        context,
        new AdapterHelper('requests', testAdapters),
        onRequestAction
    );
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('ply.request', requestEditor, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // ply-dummy scheme provider to prevent test explorer from opening as text
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('ply-dummy', {
            provideTextDocumentContent() {
                return '';
            }
        })
    );
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            const uri = editor?.document.uri;
            if (uri?.scheme === 'ply-dummy') {
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                const fileUri = uri.with({ scheme: 'file', query: '' });
                if (uri.path.endsWith('.flow') && uri.query !== 'request') {
                    vscode.commands.executeCommand('ply.open-flow', { uri: fileUri });
                } else {
                    if (uri.path.endsWith('.ply')) {
                        vscode.commands.executeCommand('ply.open-request', {
                            uri: uri.with({ scheme: 'file', query: '', fragment: '' })
                        });
                    } else if (
                        vscode.workspace
                            .getConfiguration('ply', fileUri)
                            .get('testExplorerUseRequestEditor')
                    ) {
                        // open sub req in request editor
                        vscode.commands.executeCommand('ply.open-request', {
                            uri: uri.with({ scheme: 'ply-request', query: '' })
                        });
                    } else {
                        if (uri.path.endsWith('.flow')) {
                            vscode.commands.executeCommand('ply.open-flow', { uri: fileUri });
                        } else {
                            let lineNumber = 0;
                            if (uri.fragment) {
                                const workspaceFolder =
                                    vscode.workspace.getWorkspaceFolder(fileUri);
                                if (workspaceFolder) {
                                    const adapter = testAdapters.get(
                                        workspaceFolder.uri.toString()
                                    );
                                    if (adapter) {
                                        const test = adapter.plyRoots.findInfo(
                                            fileUri.with({ query: '' }).toString()
                                        );
                                        lineNumber = test?.line || 0;
                                    }
                                }
                            }
                            openEditor(fileUri.with({ fragment: '', query: '' }), lineNumber);
                        }
                    }
                }
            }
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
            vscode.commands.executeCommand('vscode.openWith', uri, 'ply.request');
        })
    );

    const flowEditor = new FlowEditor(
        context,
        new AdapterHelper('flows', testAdapters),
        onFlowItemSelect,
        onFlowAction,
        onFlowModeChange,
        onFlowConfiguratorOpen
    );

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('ply.flow.diagram', flowEditor)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.open-flow', async (...args: any[]) => {
            const item = await PlyItem.getItem(...args);
            if (item?.uri) {
                const fileUri = vscode.Uri.file(item.uri.fsPath);
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    fileUri,
                    'ply.flow.diagram'
                );
                if (item.uri.fragment) {
                    _onFlowItemSelect.emit({ uri: item.uri });
                }
                return fileUri;
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ply.flow.configurator', async (..._args: any[]) => {
            _onFlowConfiguratorOpen.emit({});
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

    const vizEditor = new VizEditor(context, new AdapterHelper('requests', testAdapters));
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
            testExplorerExtension.exports,
            (workspaceFolder) => {
                // TODO dispose plyRoots and diffHandlers in onDidChangeWorkspaceFolders
                const plyRoots = new PlyRoots(workspaceFolder.uri);
                context.subscriptions.push(plyRoots);
                const diffState = new DiffState(workspaceFolder, context.workspaceState);
                let adapter: PlyAdapter | undefined = undefined;
                const retire = (testIds: string[]) => adapter?.retireIds(testIds);
                const diffHandler = new DiffHandler(
                    workspaceFolder,
                    plyRoots,
                    diffState,
                    decorator,
                    retire,
                    log
                );
                context.subscriptions.push(diffHandler);
                diffHandlers.set(workspaceFolder.uri.toString(), diffHandler);
                adapter = new PlyAdapter(workspaceFolder, plyRoots, diffState, outputChannel, log);
                testAdapters.set(workspaceFolder.uri.toString(), adapter);
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
                    await adapter.run([item.id], {}, { submit: true });
                } else {
                    // could be a suite/test from another adapter (eg: mocha)
                    // workaround pending https://github.com/hbenl/vscode-test-explorer/issues/158
                    console.warn(`Ply test info not found for id: ${item.id} (not a ply test?)`);
                    vscode.commands.executeCommand('test-explorer.run', args[0]);
                }
            }
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('ply.submit', submitCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.submit-item', submitCommand));

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
                const info = diffHandler.plyRoots.findInfo(item.id);
                if (info) {
                    await diffHandler.doDiff(info);
                } else {
                    // could be a suite/test from another adapter (eg: mocha)
                    // workaround pending https://github.com/hbenl/vscode-test-explorer/issues/158
                    console.warn(`Ply test info not found for id: ${item.id} (not a ply test?)`);
                    vscode.commands.executeCommand('test-explorer.show-source', args[0]);
                }
            }
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
        }
    };
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff', diffCommand));
    context.subscriptions.push(vscode.commands.registerCommand('ply.diff-item', diffCommand));
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.diff.fragment-item', diffCommand)
    );

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
                            let suiteId = diffHandler.plyRoots.getSuiteIdForExpectedResult(fileUri);
                            if (!suiteId) {
                                suiteId = diffHandler.plyRoots.getSuiteIdForActualResult(fileUri);
                            }
                            if (suiteId) {
                                const info = diffHandler.plyRoots.findInfo(suiteId);
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
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.import.postman-item', importPostmanCommand)
    );
    const importInsomniaCommand = async (...args: any[]) => await importer.import('insomnia', args);
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.import.insomnia', importInsomniaCommand)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('ply.import.insomnia-item', importInsomniaCommand)
    );

    console.log(`vscode-ply activated in ${Date.now() - before} ms`);

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
}

export function deactivate() {}
