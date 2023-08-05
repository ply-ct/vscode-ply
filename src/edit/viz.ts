import * as path from 'path';
import * as vscode from 'vscode';
import { AdapterHelper } from '../adapter-helper';
import { Web } from './web';

export class VizEditor implements vscode.CustomTextEditorProvider {
    constructor(private context: vscode.ExtensionContext, private adapterHelper: AdapterHelper) {}

    /**
     * This is called once when flow is opened (not called again on lose/regain focus).
     */
    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true
        };

        let disposables: { dispose(): void }[] = [];

        const mediaPath = path.join(this.context.extensionPath, 'media');
        const baseUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();

        const web = new Web(
            baseUri,
            path.join(mediaPath, 'viz.html'),
            webviewPanel.webview.cspSource
        );

        webviewPanel.webview.html = web.html;

        const updateWebview = async () => {
            const suiteRuns = await this.adapterHelper.getPlyResults(document.uri);
            const msg = {
                type: 'update',
                base: baseUri.toString(),
                file: document.uri.toString(),
                runs: suiteRuns
            } as any;
            webviewPanel.webview.postMessage(msg);
        };

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                if (message.type === 'request') {
                    const uri = vscode.Uri.parse(message.request).with({ scheme: 'ply-request' });
                    vscode.commands.executeCommand('ply.open-request', {
                        uri,
                        runNumber: message.runNumber
                    });
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidChangeTextDocument((docChange) => {
                // TODO: live view
            })
        );

        disposables.push(
            vscode.workspace.onDidChangeConfiguration((configChange) => {
                if (configChange.affectsConfiguration('workbench.colorTheme')) {
                    webviewPanel.webview.postMessage({
                        type: 'theme-change'
                    });
                }
            })
        );

        webviewPanel.onDidDispose(() => {
            for (const disposable of disposables) {
                disposable.dispose();
            }
            disposables = [];
        });

        updateWebview();
    }
}
