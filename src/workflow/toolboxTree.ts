import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface Spec {
    id: string,
    label: string,
    category?: string,
    icon?: string
}

/**
 * TODO: tree should honor file system dir structure and/or spec category
 */
export class ToolboxProvider implements vscode.TreeDataProvider<Spec> {

    constructor(readonly specPath: string, readonly iconPath: string) {

    }

    // onDidChangeTreeData?: vscode.Event<void | Spec>;

    getTreeItem(spec: Spec): vscode.TreeItem {
        const item: vscode.TreeItem = {
            id: spec.id,
            label: spec.label
        };
        if (spec.icon) {
            item.iconPath = path.join(this.iconPath, spec.icon);
        }
        return item;
    }

    /**
     * TODO: async?
     */
    getChildren(element?: Spec): Spec[] {
        const specs: Spec[] = [];
        if (!element) {
            for (const file of fs.readdirSync(this.specPath)) {
                const filepath = path.join(this.specPath, file);
                if (!fs.statSync(filepath).isDirectory() && file.endsWith('.spec')) {
                    const text = fs.readFileSync(filepath, 'utf-8');
                    if (text) {
                        try {
                            specs.push(JSON.parse(text));
                        } catch (err) {
                            console.log(err);
                            // this.log.error(err);
                        }
                    }
                }
            }
        }

        return specs;
    }

    // getParent?(element: Spec): vscode.ProviderResult<Spec> {
    //     throw new Error('Method not implemented.');
    // }

}

export class ToolboxTree {

    private toolbox: vscode.TreeView<Spec>;

    constructor(context: vscode.ExtensionContext) {
		const toolboxProvider = new ToolboxProvider(
            path.join(context.extensionPath, 'media', 'specs'),
            path.join(context.extensionPath, 'media', 'icons')
        );
		this.toolbox = vscode.window.createTreeView('ply.toolbox2', { treeDataProvider: toolboxProvider });
		// vscode.commands.registerCommand('fileExplorer.openFile', (resource) => this.openResource(resource));
    }
}