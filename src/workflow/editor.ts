import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';

export class WorkflowEditor implements vscode.CustomTextEditorProvider {

    static specs: any[] | undefined;

    constructor(
        readonly extensionPath: string,
        readonly log: Log
    ) {}

    loadSpecs(specPath: string): any[] {
        this.log.info(`Loading workflow specs from ${specPath}`);
        const specs: string[] = [];
        for (const file of fs.readdirSync(specPath)) {
            const filepath = path.join(specPath, file);
            if (!fs.statSync(filepath).isDirectory() && file.endsWith('.spec')) {
                const text = fs.readFileSync(filepath, 'utf-8');
                if (text) {
                    try {
                        specs.push(JSON.parse(text));
                    } catch (err) {
                        console.log(err);
                        this.log.error(err);
                    }
                }
            }
        }
        return specs;
    }

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {

        webviewPanel.webview.options = {
            enableScripts: true
        };

        const mediaPath = path.join(this.extensionPath, 'media');
        if (!WorkflowEditor.specs) {
            WorkflowEditor.specs = this.loadSpecs(path.join(mediaPath, 'specs'));
        }

        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath));

        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                base: baseUri.toString(),
                specs: WorkflowEditor.specs,
                file: path.basename(document.uri.fsPath),
                text: document.getText(),
            });
        }

        const scriptUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
            path.join(mediaPath, 'out', 'bundle.js')
        ));
        const styleUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(
            path.join(mediaPath, 'workflow.css')
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
                    <canvas id="workflow-canvas" class="diagram"></canvas>
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