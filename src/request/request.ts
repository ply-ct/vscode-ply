import * as os from 'os';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';

export interface Request {
    name: string;
    url: string;
    method: string;
    headers: { [key: string]: string };
    body?: string;
}

export class RequestMerge {
    constructor(readonly fileUri: vscode.Uri) {}

    private async fileText(): Promise<string> {
        return Buffer.from(await vscode.workspace.fs.readFile(this.fileUri)).toString('utf8');
    }

    /**
     * Returns the range in file doc corresponding to a request
     */
    getRange(requestUri: vscode.Uri, fileDoc: vscode.TextDocument): vscode.Range {
        const reqObj = this.getRequestObject(requestUri, fileDoc.getText());
        return new vscode.Range(
            new vscode.Position(reqObj.__start, 0),
            new vscode.Position(reqObj.__end + 1, 0)
        );
    }

    /**
     * Read embedded request from file
     */
    async readRequest(requestUri: vscode.Uri, text: string): Promise<string> {
        // const fileText = await this.fileText();
        const reqObj = this.getRequestObject(requestUri, text);
        return ply.util
            .lines(text)
            .slice(reqObj.__start, reqObj.__end + 1)
            .join(os.EOL);
    }

    /**
     * Write embedded request into file
     */
    async writeRequest(requestUri: vscode.Uri, text: string) {
        const fileText = await this.fileText();
        let updated = text.trimEnd();
        const reqObj = this.getRequestObject(requestUri, fileText);
        const lines = ply.util.lines(fileText);
        updated =
            lines.slice(0, reqObj.__start).join(os.EOL) +
            (reqObj.__start > 0 ? os.EOL : '') +
            updated +
            (reqObj.__end < lines.length - 1 ? os.EOL : '') +
            lines.slice(reqObj.__end + 1).join(os.EOL);
        await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(updated, 'utf8'));
    }

    getRequestObject(requestUri: vscode.Uri, yaml: string) {
        let reqObj: any;
        try {
            const yamlObj = ply.loadYaml(this.fileUri.fsPath, yaml, true);
            reqObj = yamlObj[requestUri.fragment];
        } catch (err: unknown) {
            console.error(err);
            throw err;
        }
        if (!reqObj) {
            throw new Error(`Request '${requestUri.fragment}' not found in: ${this.fileUri}`);
        }
        return reqObj;
    }
}
