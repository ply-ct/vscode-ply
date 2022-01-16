import * as os from 'os';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { Step } from 'flowbee';
import { PlyConfig } from '../config';

export class FlowMerge {
    constructor(readonly fileUri: vscode.Uri) {}

    private async fileText(): Promise<string> {
        return Buffer.from(await vscode.workspace.fs.readFile(this.fileUri)).toString('utf8');
    }

    /**
     * Read embedded request from file
     */
    async readRequest(requestUri: vscode.Uri, text: string): Promise<string> {
        const yamlObj = ply.loadYaml(this.fileUri.fsPath, text);
        const step = this.getStep(requestUri, yamlObj);
        return ply.dumpYaml(this.getRequest(step), this.getIndent());
    }

    /**
     * Write embedded request into file
     */
    async writeRequest(requestUri: vscode.Uri, text: string) {
        const updated = await this.updateRequest(requestUri, text);
        await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(updated, 'utf8'));
    }

    /**
     * Returns flow yaml text with updated request
     */
    async updateRequest(requestUri: vscode.Uri, text: string): Promise<string> {
        const fileText = await this.fileText();
        const yamlObj = ply.loadYaml(this.fileUri.fsPath, fileText);
        const step = this.getStep(requestUri, yamlObj);
        const reqObj = ply.loadYaml(requestUri.toString(), text);
        this.setRequest(step, reqObj);
        return ply.dumpYaml(yamlObj, this.getIndent());
    }

    getRequestText(requestUri: vscode.Uri, textDoc: vscode.TextDocument): string {
        const yamlObj = ply.loadYaml(this.fileUri.fsPath, textDoc.getText());
        const step = this.getStep(requestUri, yamlObj);
        return ply.dumpYaml(this.getRequest(step), this.getIndent());
    }

    /**
     * Get step from flow request uri
     */
    private getStep(uri: vscode.Uri, yamlObj: any): Step {
        let step: Step | undefined;
        if (uri.fragment.startsWith('f')) {
            const dot = uri.fragment.indexOf('.');
            const subflow = yamlObj.subflows.find(
                (sf: any) => sf.id === uri.fragment.substring(0, dot)
            );
            if (subflow) {
                step = subflow.steps.find((s: any) => s.id === uri.fragment.substring(dot + 1));
            }
        } else {
            step = yamlObj.steps.find((s: any) => s.id === uri.fragment);
        }
        if (!step) throw new Error(`Step not found: ${uri}`);
        return step;
    }

    private getRequest(step: Step): object {
        const name = step.name.replace(/\r/g, '').replace(/\n/g, '_');
        const reqObj: any = {
            [name]: {
                url: step.attributes?.url,
                method: step.attributes?.method,
                headers: {}
            }
        };
        if (step.attributes?.headers) {
            for (const row of JSON.parse(step.attributes.headers)) {
                reqObj[name].headers[row[0]] = row[1];
            }
        }
        if (step.attributes?.body) reqObj[name].body = step.attributes.body;
        return reqObj;
    }

    private setRequest(step: Step, reqObj: object) {
        const reqName = Object.keys(reqObj)[0];
        step.name = reqName.replace(/_/g, os.EOL);
        if (!step.attributes) step.attributes = {};
        const req = (reqObj as any)[reqName];
        step.attributes.url = req.url;
        step.attributes.method = req.method;
        if (req.headers) {
            const rows: string[][] = [];
            for (const key of Object.keys(req.headers)) {
                rows.push([key, '' + req.headers[key]]);
            }
            step.attributes.headers = JSON.stringify(rows);
        }
        if (req.body) step.attributes.body = req.body;
    }

    /**
     * TODO: more efficient way to determine indent
     */
    private getIndent(): number {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.fileUri);
        if (workspaceFolder) {
            return new PlyConfig(workspaceFolder).plyOptions.prettyIndent;
        } else {
            return 2;
        }
    }
}
