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
			enableScripts: true
        };

		function updateWebview() {
			webviewPanel.webview.postMessage({
                type: 'update',
                file: path.basename(document.uri.fsPath),
				text: document.getText(),
			});
        }

		const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
			path.join(this.extensionPath, 'media/out', 'bundle.js')
		));
		const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
			path.join(this.extensionPath, 'media', 'workflow.css')
        ));

        const nonce = this.getNonce();

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewPanel.webview.cspSource}; style-src ${webviewPanel.webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet" />
                <title>Ply Workflow</title>
            </head>
            <body>
                <div class="flow">
                    <canvas id="my-canvas" class="diagram"></canvas>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;

        webviewPanel.webview.html = html;

        updateWebview();
    }

    getNonce(): string {
        let nonce = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            nonce += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return nonce;
    }

}