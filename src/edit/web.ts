import * as fs from 'fs';
import * as vscode from 'vscode';

export class Web {
    private static htmls = new Map<string, string>();

    webSocketPort?: number;

    constructor(readonly baseUri: string, readonly template: string, readonly cspSource: string) {}

    get html(): string {
        let html = Web.htmls.get(this.template);

        // cache this
        if (!html) {
            html = fs.readFileSync(this.template, 'utf-8');
            Web.htmls.set(this.template, html);
        }

        // webBase
        html = html.replace(/\${webBase}/g, this.baseUri);
        // webSocket
        if (this.webSocketPort) {
            html = html.replace(/\${wsSource}/g, `ws://localhost:${this.webSocketPort}`);
        }
        // csp source and nonce
        html = html.replace(/\${cspSource}/g, this.cspSource);
        html = html.replace(/\${nonce}/g, this.getNonce());

        if (vscode.workspace.isTrusted) {
            html = html.replace(/\${trustedEval}/g, `'unsafe-eval'`);
        } else {
            html = html.replace(/\${trustedEval}/g, '');
        }

        return html;
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
