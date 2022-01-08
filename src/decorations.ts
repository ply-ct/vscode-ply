import * as vscode from 'vscode';

export const Colors = {
    matchBackground: new vscode.ThemeColor('editor.background'),
    matchBorder: new vscode.ThemeColor('editorLineNumber.foreground')
};

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
