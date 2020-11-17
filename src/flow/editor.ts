import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export class FlowEditor implements vscode.CustomTextEditorProvider {

    private static html: string;

    constructor(
        readonly context: vscode.ExtensionContext
    ) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {

        webviewPanel.webview.options = {
            enableScripts: true
        };

        const mediaPath = path.join(this.context.extensionPath, 'media');

        FlowEditor.html = '';
        // TODO cache this
        if (!FlowEditor.html) {
            FlowEditor.html = fs.readFileSync(path.join(mediaPath, 'flow.html'), 'utf-8');

            // img
            const img  = vscode.Uri.file(path.join(mediaPath, 'icons'));
            const imgBase = webviewPanel.webview.asWebviewUri(img).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${imgBase}/g, imgBase);

            // css
            const flowCss = vscode.Uri.file(path.join(mediaPath, 'css', 'flow.css'));
            const flowCssUri = webviewPanel.webview.asWebviewUri(flowCss).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${flowCssUri}/g, flowCssUri);
            const flowbeeCss = vscode.Uri.file(path.join(mediaPath, 'css', 'flowbee.css'));
            const flowbeeCssUri = webviewPanel.webview.asWebviewUri(flowbeeCss).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${flowbeeCssUri}/g, flowbeeCssUri);

            // javascript
            const js = vscode.Uri.file(path.join(mediaPath, 'out', 'bundle.js'));
            const jsUri = webviewPanel.webview.asWebviewUri(js).toString();
            FlowEditor.html = FlowEditor.html.replace(/\${jsUri}/g, jsUri);
        }

        // substitute the nonce every time
        let html = FlowEditor.html.replace(/\${cspSource}/g, webviewPanel.webview.cspSource);
        html = html.replace(/\${nonce}/g, this.getNonce());
        webviewPanel.webview.html = html;

        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath));
        function updateWebview() {
            webviewPanel.webview.postMessage({
                type: 'update',
                base: baseUri.toString(),
                file: path.basename(document.uri.fsPath),
                text: document.getText(),
                readonly: (fs.statSync(document.uri.fsPath).mode & 146) === 0
            });
        }

        const docChangeSubscription = webviewPanel.webview.onDidReceiveMessage(async message => {
            if (message.type === 'change') {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, document.lineCount, 0),
                    message.text
                );
                return vscode.workspace.applyEdit(edit);
            } else if (message.type === 'alert' || message.type === 'confirm') {
                const options: vscode.MessageOptions = {};
                const items: string[] = [];
                if (message.type === 'confirm') {
                    options.modal = true;
                    items.push('OK');
                }
                let res;
                if (message.message.level === 'info') {
                    res = await vscode.window.showInformationMessage(message.message.text, options, ...items);
                } else if (message.message.level === 'warning') {
                    res = await vscode.window.showWarningMessage(message.message.text, options, ...items);
                } else {
                    res = await vscode.window.showErrorMessage(message.message.text, options, ...items);
                }
                webviewPanel.webview.postMessage({
                    type: 'confirm',
                    id: message.message.id,
                    result: res === 'OK'
                });
            }
        });

        const themeChangeSubscription = vscode.workspace.onDidChangeConfiguration(configChange => {
            if (configChange.affectsConfiguration('workbench.colorTheme')) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            docChangeSubscription.dispose();
            themeChangeSubscription.dispose();
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