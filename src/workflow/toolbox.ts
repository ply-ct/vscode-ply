import * as path from 'path';
import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import { Workflow } from './workflow';

export class Toolbox implements vscode.WebviewViewProvider {

    static selected: string | null = null;

    constructor(
        readonly extensionUri: vscode.Uri,
        readonly log: Log
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.extensionUri
            ]
        };

        const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
        const baseUri = webviewView.webview.asWebviewUri(mediaUri);

        if (!Workflow.specs) {
            const specsPath = path.join(mediaUri.fsPath, 'specs');
            this.log.info(`Loading workflow specs from ${specsPath}`);
            Workflow.specs = Workflow.loadSpecs(specsPath);
        }

        function updateWebview() {
            // TODO:
            const specs = Workflow.specs?.map(spec => {
                if (spec.icon === 'shape:start') {
                    return { ...spec, icon: 'start.png' };
                } else if (spec.icon === 'shape:stop') {
                    return { ...spec, icon: 'stop.png' };
                } else if (spec.icon === 'shape:pause') {
                    return { ...spec, icon: 'pause.png' };
                } else if (spec.icon === 'shape:decision') {
                    return { ...spec, icon: 'decision.png' };
                } else {
                    return spec;
                }
            });

            webviewView.webview.postMessage({
                type: 'update',
                base: baseUri.toString(),
                specs
            });
        }


        const nonce = this.getNonce();

        const scriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'out', 'toolbox.js'));

		// Do the same for the stylesheet.
		const styleUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'toolbox.css'));

        webviewView.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webviewView.webview.cspSource}; style-src ${webviewView.webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet" />
            <title>Ply Toolbox</title>
          </head>
          <body class="toolbox-body">
            <div id="workflow-toolbox" class="toolbox">
              <ul>
              </ul>
            </div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
          </html>
        `;

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.type === 'select') {
                Toolbox.selected = data.selected;
                if (Toolbox.selected) {
                    this.log.info(`toolbox selected: ${Toolbox.selected}`);
                }
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