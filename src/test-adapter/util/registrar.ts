import * as vscode from 'vscode';
import { TestAdapter, TestHub } from '../api/index';
import { Log } from './log';

export class TestAdapterRegistrar<T extends TestAdapter & { dispose: () => void }> {
    private folderChangeSubscription: vscode.Disposable | undefined;
    private readonly registeredAdapters = new Map<vscode.WorkspaceFolder, T>();

    /**
     * This will create and register a TestAdapter for every WorkspaceFolder
     * and unregister and dispose it when the WorkspaceFolder is closed.
     * @param testHub - the TestHub that is exported by the Test Explorer extension
     * @param adapterFactory - factory method for creating a disposable Test Adapter
     * @param log - logger (optional)
     */
    constructor(
        private readonly testHub: TestHub,
        private readonly adapterFactory: (workspaceFolder: vscode.WorkspaceFolder) => T,
        private log: Log
    ) {
        if (vscode.workspace.workspaceFolders) {
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                this.add(workspaceFolder);
            }
        }

        this.log.info('Initialization finished');

        this.folderChangeSubscription = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            for (const workspaceFolder of event.removed) {
                this.remove(workspaceFolder);
            }

            for (const workspaceFolder of event.added) {
                this.add(workspaceFolder);
            }
        });
    }

    public getAdapter(workspaceFolder: vscode.WorkspaceFolder): T | undefined {
        return this.registeredAdapters.get(workspaceFolder);
    }

    private add(workspaceFolder: vscode.WorkspaceFolder) {
        if (workspaceFolder.uri.scheme !== 'file') {
            this.log.info(`Ignoring WorkspaceFolder with URI ${workspaceFolder.uri.toString()}`);
            return;
        }

        this.log.info(`Creating adapter for ${workspaceFolder.uri.fsPath}`);

        const adapter = this.adapterFactory(workspaceFolder);
        this.registeredAdapters.set(workspaceFolder, adapter);

        this.log.info(`Registering adapter for ${workspaceFolder.uri.fsPath}`);

        this.testHub.registerTestAdapter(adapter);
    }

    private remove(workspaceFolder: vscode.WorkspaceFolder) {
        const adapter = this.registeredAdapters.get(workspaceFolder);
        if (adapter) {
            this.log.info(`Removing adapter for ${workspaceFolder.uri.fsPath}`);

            this.testHub.unregisterTestAdapter(adapter);
            this.registeredAdapters.delete(workspaceFolder);
            adapter.dispose();
        }
    }

    dispose(): void {
        for (const workspaceFolder of this.registeredAdapters.keys()) {
            this.remove(workspaceFolder);
        }
        if (this.folderChangeSubscription) {
            this.folderChangeSubscription.dispose();
            this.folderChangeSubscription = undefined;
        }
    }
}
