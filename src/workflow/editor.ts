import * as vscode from 'vscode';

export class WorkflowEditor implements vscode.CustomTextEditorProvider {


    resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }

}