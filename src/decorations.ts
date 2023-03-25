import * as fs from 'fs';
import * as vscode from 'vscode';

export const Colors = {
    matchBackground: new vscode.ThemeColor('editor.background'),
    matchBorder: new vscode.ThemeColor('editorLineNumber.foreground')
};

// text decorations for diff editor
export const Decorations = {
    matchHighlight: vscode.window.createTextEditorDecorationType({
        isWholeLine: false, // false actually overrides diff color
        backgroundColor: Colors.matchBackground,
        opacity: '1.0',
        borderColor: Colors.matchBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
    })
};

export class PlyExplorerDecorationProvider implements vscode.FileDecorationProvider {
    provideFileDecoration(
        uri: vscode.Uri,
        token: vscode.CancellationToken
    ): vscode.FileDecoration | null {
        if (uri.scheme === 'ply-explorer') {
            if (uri.path.endsWith('.ply')) {
                console.log('DECORATE: ' + uri);
                console.log('SCHEME: ' + uri.scheme);
                return {
                    badge: 'G',
                    tooltip: 'GET'
                };
            }
            if ((uri.path.endsWith('.yaml') || uri.path.endsWith('.yml')) && uri.fragment) {
                console.log('DECORATE: ' + uri);
                console.log('SCHEME: ' + uri.scheme);
                return {
                    badge: 'Pa'
                };
            }
        } else if (uri.scheme === 'ply-values') {
            const file = uri.with({ scheme: 'file' }).fsPath;
            if (!fs.existsSync(file)) {
                return {
                    color: new vscode.ThemeColor('disabledForeground')
                };
            }
        }
        return null;
    }
}
