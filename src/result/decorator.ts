import * as vscode from 'vscode';

export class PlyResultDecorator {

    private readonly decorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: 'black'
        });
    }

    dispose() {
    }

    async applyDecorations(editor: vscode.TextEditor) {
        const decoration = { range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(10, 0)) };
        editor.setDecorations(this.decorationType, [decoration]);
    }
}