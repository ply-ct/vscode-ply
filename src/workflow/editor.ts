import * as path from 'path';
import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import { Toolbox } from './toolbox';
import { Workflow } from './workflow';

export class WorkflowEditor implements vscode.CustomTextEditorProvider {


    constructor(
        readonly extensionPath: string,
        readonly log: Log
    ) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {

        webviewPanel.webview.options = {
            enableScripts: true
        };

        const mediaPath = path.join(this.extensionPath, 'media');
        if (!Workflow.specs) {
            const specsPath = path.join(mediaPath, 'specs');
            this.log.info(`Loading workflow specs from ${specsPath}`);
            Workflow.specs = Workflow.loadSpecs(specsPath);
        }

        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath));

        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                base: baseUri.toString(),
                specs: Workflow.specs,
                file: path.basename(document.uri.fsPath),
                text: document.getText(),
            });
        }

        const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
            path.join(mediaPath, 'out', 'workflow.js')
        ));
        const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
            path.join(mediaPath, 'workflow.css')
        ));

        const nonce = this.getNonce();

        webviewPanel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewPanel.webview.cspSource}; style-src ${webviewPanel.webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet" />
            <title>Ply Workflow</title>
          </head>
          <body class="workflow-body">
            <div class="workflow-diagram">
              <canvas id="workflow-canvas" class="diagram"></canvas>
            </div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
          </html>
        `;

        webviewPanel.onDidChangeViewState(e => {
            this.log.info("VIEW STATE CHANGE");
        });

        webviewPanel.webview.onDidReceiveMessage(data => {
            if (data.type === 'drag' && Toolbox.selected) {
                //
            }
        });


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