import * as vscode from 'vscode';
import { TestController, TestAdapter } from './test-adapter/api/index';
import { TestCollection } from './test-explorer/tree/testCollection';
import { TreeNode } from './test-explorer/tree/treeNode';
import { ErrorNode } from './test-explorer/tree/errorNode';
import { IconPaths } from './test-explorer/iconPaths';
import { TreeEventDebouncer } from './test-explorer/treeEventDebouncer';
import { Decorator } from './test-explorer/decorator';
import { pickNodes, getAdapterIds } from './test-explorer/util';
import { TestNode } from './test-explorer/tree/testNode';
import { TestSuiteNode } from './test-explorer/tree/testSuiteNode';
import { Result } from './result/result';

export class PlyExplorer
    implements
        TestController,
        vscode.TreeDataProvider<TreeNode | ErrorNode>,
        vscode.CodeLensProvider,
        vscode.HoverProvider
{
    public readonly iconPaths: IconPaths;
    public readonly decorator: Decorator;
    public readonly treeEvents: TreeEventDebouncer;

    private readonly outputChannel: vscode.OutputChannel;
    private nodesShownInOutputChannel:
        | undefined
        | {
              collection: TestCollection;
              ids: string[];
          };

    private readonly treeDataChanged = new vscode.EventEmitter<TreeNode>();
    public readonly onDidChangeTreeData: vscode.Event<TreeNode>;

    public readonly codeLensesChanged = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void>;

    public readonly collections = new Map<TestAdapter, TestCollection>();
    // the collections that are in the process of loading their test definitions
    private readonly loadingCollections = new Set<TestCollection>();
    // the collections that are running tests
    private readonly runningCollections = new Set<TestCollection>();

    private lastTestRun?: [TestCollection, string[]];

    constructor(public readonly context: vscode.ExtensionContext) {
        this.iconPaths = new IconPaths(context);
        this.decorator = new Decorator(context, this);
        this.treeEvents = new TreeEventDebouncer(this.collections, this.treeDataChanged);

        this.outputChannel = vscode.window.createOutputChannel('Ply Explorer');
        context.subscriptions.push(this.outputChannel);

        this.onDidChangeTreeData = this.treeDataChanged.event;
        this.onDidChangeCodeLenses = this.codeLensesChanged.event;
    }

    registerTestAdapter(adapter: TestAdapter): void {
        this.collections.set(adapter, new TestCollection(adapter, this));
    }

    unregisterTestAdapter(adapter: TestAdapter): void {
        const collection = this.collections.get(adapter);
        if (collection) {
            collection.dispose();
            this.collections.delete(adapter);
            this.decorator.updateAllDecorations();
            this.treeEvents.sendTreeChangedEvent();
            this.codeLensesChanged.fire();
        }
    }

    getTreeItem(node: TreeNode | ErrorNode): vscode.TreeItem {
        return node.getTreeItem();
    }

    getChildren(node?: TreeNode | ErrorNode): (TreeNode | ErrorNode)[] {
        if (node) {
            if (node instanceof TestSuiteNode && node.isMergedNode) {
                return ([] as TreeNode[]).concat(...node.children.map((child) => child.children));
            }
            return node.children;
        } else {
            const nonEmptyCollections = [...this.collections.values()].filter(
                (collection) => collection.suite !== undefined || collection.error !== undefined
            );

            if (nonEmptyCollections.length === 0) {
                return [];
            } else if (nonEmptyCollections.length === 1) {
                const collection = nonEmptyCollections[0];
                if (collection.suite) {
                    return collection.suite.children;
                } else {
                    // collection.error !== undefined
                    return [collection.error!];
                }
            } else {
                return nonEmptyCollections.map(
                    (collection) => (collection.suite || collection.error)!
                );
            }
        }
    }

    getParent(node: TreeNode | ErrorNode): TreeNode | undefined {
        return (<any>node).parent;
    }

    reload(node?: TreeNode | ErrorNode): void {
        if (node) {
            node.collection.adapter.load();
        } else {
            for (const adapter of this.collections.keys()) {
                try {
                    adapter.load();
                } catch (err: unknown) {
                    // noop
                }
            }
        }
    }

    async run(nodes?: TreeNode[], pick = true): Promise<void> {
        this.lastTestRun = undefined;

        if (nodes) {
            const nodesToRun = pick ? await pickNodes(nodes) : nodes;
            if (nodesToRun.length > 0) {
                this.lastTestRun = [nodesToRun[0].collection, getAdapterIds(nodesToRun)];
                nodesToRun[0].collection.adapter.run(getAdapterIds(nodesToRun));
            }
        } else {
            for (const collection of this.collections.values()) {
                if (collection.suite) {
                    try {
                        collection.adapter.run(collection.suite.adapterIds);
                    } catch (err: unknown) {
                        // noop
                    }
                }
            }
        }
    }

    rerun(): Promise<void> {
        if (this.lastTestRun) {
            const collection = this.lastTestRun[0];
            const testIds = this.lastTestRun[1];
            return collection.adapter.run(testIds);
        }

        return Promise.resolve();
    }

    async debug(nodes?: TreeNode[], pick = true): Promise<void> {
        this.lastTestRun = undefined;

        if (nodes) {
            const nodesToRun = pick ? await pickNodes(nodes) : nodes;
            if (nodesToRun.length > 0 && nodesToRun[0].collection.adapter.debug) {
                try {
                    this.lastTestRun = [nodesToRun[0].collection, getAdapterIds(nodesToRun)];
                    await nodesToRun[0].collection.adapter.debug(getAdapterIds(nodesToRun));
                } catch (e: unknown) {
                    vscode.window.showErrorMessage(`Error while debugging test: ${e}`);
                    return;
                }
            }
        } else {
            for (const collection of this.collections.values()) {
                if (collection.suite && collection.adapter.debug) {
                    try {
                        await collection.adapter.debug(collection.suite.adapterIds);
                    } catch (e: unknown) {
                        vscode.window.showErrorMessage(`Error while debugging test: ${e}`);
                        return;
                    }
                }
            }
        }
    }

    redebug(): Promise<void> {
        if (this.lastTestRun) {
            const collection = this.lastTestRun[0];
            const testIds = this.lastTestRun[1];
            return collection.adapter.debug!(testIds);
        }

        return Promise.resolve();
    }

    cancel(): void {
        for (const adapter of this.collections.keys()) {
            try {
                adapter.cancel();
            } catch (err: unknown) {
                // noop
            }
        }
    }

    showLog = (function () {
        let lastCalled = new Date(); // function-local static
        function showLog(this: PlyExplorer, nodes: TestNode[]) {
            const dateDiff = (new Date() as any) - <any>lastCalled;
            lastCalled = new Date();
            const doubleClick = dateDiff < 250;
            const previewOn = vscode.workspace
                .getConfiguration('workbench')
                .get('editor.enablePreview', true);
            this.showSource(nodes[0], previewOn && !doubleClick);
            if (nodes.length > 0) {
                this.nodesShownInOutputChannel = {
                    collection: nodes[0].collection,
                    ids: nodes.map((node) => node.info.id)
                };
            } else {
                this.nodesShownInOutputChannel = undefined;
            }

            this.updateLog();
        }
        return showLog;
    })();

    showError(message: string | undefined): void {
        this.outputChannel.clear();
        this.nodesShownInOutputChannel = undefined;

        if (message) {
            this.outputChannel.append(message);
            this.outputChannel.show(true);
        } else {
            this.outputChannel.hide();
        }
    }

    async showSource(node: TreeNode, preview: boolean): Promise<void> {
        if (node.fileUri) {
            let uri = vscode.Uri.parse(node.fileUri);
            if (!uri.path.endsWith('.ply')) {
                const hash = node.info.id.lastIndexOf('#');
                if (hash > 0 && hash < node.info.id.length - 1) {
                    uri = uri.with({ fragment: node.info.id.substring(hash + 1) });
                }
            }
            console.info(`Showing source: ${uri}`);
            await this.openEditor(uri, preview, node.line);
        }
    }

    async openEditor(fileUri: vscode.Uri, preview: boolean, lineNumber?: number) {
        const reqEd =
            fileUri.fragment &&
            vscode.workspace
                .getConfiguration('ply', fileUri)
                .get('plyExplorerUseRequestEditor', false);

        if (reqEd) {
            await vscode.commands.executeCommand('ply.open-request', {
                uri: fileUri.with({ scheme: 'ply-request' }),
                preview
            });
        } else {
            if (fileUri.path.endsWith('.flow')) {
                // fragment should be used for step select
                await vscode.commands.executeCommand('ply.open-flow', { uri: fileUri, preview });
            } else {
                await vscode.commands.executeCommand(
                    'vscode.open',
                    fileUri.with({ fragment: '' }),
                    { preview }
                );
            }

            if (lineNumber && !reqEd) {
                const editor = vscode.window.visibleTextEditors.find((editor) => {
                    let docUri = editor.document.uri;
                    if (docUri.scheme === Result.URI_SCHEME) {
                        // when codelens is 'Compare result files' clicked in actual, scheme is ply-result;
                        // so convert to file uri
                        docUri = Result.convertUri(editor.document.uri);
                    }
                    return (
                        docUri.with({ fragment: '' }).toString() ===
                        fileUri.with({ fragment: '' }).toString()
                    );
                });
                if (editor) {
                    await vscode.commands.executeCommand('revealLine', { lineNumber, at: 'top' });
                }
            }
        }
    }

    setAutorun(node?: any): void {
        if (node instanceof TestNode || node instanceof TestSuiteNode) {
            node.collection.setAutorun(node);
        } else {
            for (const collection of this.collections.values()) {
                collection.setAutorun(collection.suite);
            }
        }
    }

    clearAutorun(node?: any): void {
        if (node instanceof TestNode || node instanceof TestSuiteNode) {
            node.collection.setAutorun(undefined);
        } else {
            for (const collection of this.collections.values()) {
                collection.setAutorun(undefined);
            }
        }
    }

    retireState(node?: any): void {
        if (node instanceof TestNode || node instanceof TestSuiteNode) {
            node.collection.retireState(node);
        } else {
            for (const collection of this.collections.values()) {
                collection.retireState();
            }
        }
    }

    resetState(node?: any): void {
        if (node instanceof TestNode || node instanceof TestSuiteNode) {
            node.collection.resetState(node);
        } else {
            for (const collection of this.collections.values()) {
                collection.resetState();
            }
        }
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] {
        const fileUri = document.uri.toString();
        let codeLenses: vscode.CodeLens[] = [];
        for (const collection of this.collections.values()) {
            codeLenses = codeLenses.concat(collection.getCodeLenses(fileUri));
        }

        return codeLenses;
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | undefined {
        for (const collection of this.collections.values()) {
            const hover = collection.getHover(document, position);
            if (hover) {
                return hover;
            }
        }

        return undefined;
    }

    reveal(
        node: string | TreeNode | ErrorNode,
        treeView: vscode.TreeView<TreeNode | ErrorNode>
    ): void {
        if (typeof node === 'string') {
            for (const collection of this.collections.values()) {
                const nodes = collection.findNodesById([node]);
                if (nodes.length > 0) {
                    treeView.reveal(nodes[0]);
                    return;
                }
            }
        } else {
            treeView.reveal(node);
        }
    }

    testLoadStarted(collection: TestCollection): void {
        this.loadingCollections.add(collection);
        vscode.commands.executeCommand('setContext', 'testsLoading', true);
    }

    testLoadFinished(collection: TestCollection): void {
        this.loadingCollections.delete(collection);
        if (this.loadingCollections.size === 0) {
            vscode.commands.executeCommand('setContext', 'testsLoading', false);
        }
        vscode.commands.executeCommand('setContext', 'ply.explorer.showTree', true);
    }

    testRunStarted(collection: TestCollection): void {
        this.runningCollections.add(collection);
        vscode.commands.executeCommand('setContext', 'testsRunning', true);
    }

    testRunFinished(collection: TestCollection): void {
        this.runningCollections.delete(collection);
        if (this.runningCollections.size === 0) {
            vscode.commands.executeCommand('setContext', 'testsRunning', false);
        }
    }

    logChanged(node: TestNode): void {
        if (
            this.nodesShownInOutputChannel &&
            this.nodesShownInOutputChannel.collection === node.collection &&
            this.nodesShownInOutputChannel.ids.includes(node.info.id)
        ) {
            this.updateLog();
        }
    }

    private updateLog(): void {
        this.outputChannel.clear();

        let logIsEmpty = true;
        if (this.nodesShownInOutputChannel) {
            const nodes = this.nodesShownInOutputChannel.collection.findNodesById(
                this.nodesShownInOutputChannel.ids
            );

            for (const node of nodes) {
                if (node.log) {
                    this.outputChannel.append(node.log);
                    logIsEmpty = false;
                }
            }
        }

        if (logIsEmpty) {
            if (
                this.nodesShownInOutputChannel &&
                this.nodesShownInOutputChannel.collection.shouldHideEmptyLog()
            ) {
                this.outputChannel.hide();
            }
        } else {
            this.outputChannel.show(true);
        }
    }
}
