import * as path from 'path';
import * as vscode from 'vscode';
export class ValuesRoot extends vscode.TreeItem {
    id: string;

    constructor(readonly workspaceFolder: string) {
        super(workspaceFolder, vscode.TreeItemCollapsibleState.Expanded);
        this.id = workspaceFolder;
    }
}

export class ValuesFile extends vscode.TreeItem {
    id: string;

    /**
     * @param file relative to workspace folder or workspace
     */
    constructor(
        private iconBase: string,
        readonly uri: vscode.Uri,
        readonly folder: string, // workspace folder name
        readonly file: string,
        readonly checked: boolean,
        readonly onSelect: (valueFile: ValuesFile) => Promise<void>
    ) {
        super(path.basename(file), vscode.TreeItemCollapsibleState.None);
        this.id = uri.toString();
        this.resourceUri = uri.with({ scheme: 'ply-values' });
        this.checked = checked;
        const icon = this.checked ? 'checked.svg' : 'unchecked.svg';
        this.iconPath = {
            dark: `${this.iconBase}/icons/dark/${icon}`,
            light: `${this.iconBase}/icons/light/${icon}`
        };
        this.description = path.normalize(path.dirname(file));
        this.command = {
            title: '',
            command: 'ply.values.select',
            arguments: [this]
        };
    }
}
