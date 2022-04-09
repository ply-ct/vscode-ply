import * as path from 'path';
import * as vscode from 'vscode';
import { AdapterHelper } from '../adapterHelper';
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
            const suiteRuns = await this.adapterHelper.getSuiteRuns(document.uri);
            const msg = {
                type: 'update',
                base: baseUri.toString(),
                file: document.uri.toString(),
                runs: suiteRuns
            } as any;
            await webviewPanel.webview.postMessage(msg);
        };

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                const uri = vscode.Uri.parse(
                    'ply-request:/Users/donoakes/workspaces/ply/ticketing-api-test/flows/Ticket%20Requests.ply.flow#s2'
                );
                vscode.commands.executeCommand('ply.open-request', { uri });
                console.log('MESSAGE: ' + JSON.stringify(message, null, 2));
            })
        );

        disposables.push(
            vscode.workspace.onDidChangeTextDocument((docChange) => {
                console.log('WHAT TO DO');
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

        await updateWebview();
    }
}
