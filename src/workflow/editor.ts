import * as vscode from 'vscode';
import * as path from 'path';

export class WorkflowEditor implements vscode.CustomTextEditorProvider {

    constructor(private readonly extensionPath: string) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {

		webviewPanel.webview.options = {
			enableScripts: true,
        };

		const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
			path.join(this.extensionPath, 'media', 'workflow.js')
		));
		const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
			path.join(this.extensionPath, 'media', 'workflow.css')
        ));

        let nonce = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            nonce += possible.charAt(Math.floor(Math.random() * possible.length));
        }

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">

                <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewPanel.webview.cspSource}; style-src ${webviewPanel.webview.cspSource}; script-src 'nonce-${nonce}';">

                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <link href="${styleUri}" rel="stylesheet" />

                <title>Ply Workflow</title>
            </head>
            <body>
                <div>
                  Hello, workflow!
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;

		webviewPanel.webview.html = html;
    }

}