import * as path from 'path';
import * as vscode from 'vscode';

export class ValuesFile extends vscode.TreeItem {
    id: string;

    /**
     * @param file relative to workspace folder or workspace
     */
    constructor(
        private iconBase: string,
        readonly uri: vscode.Uri,
        readonly file: string,
        readonly checked: boolean
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
