import * as vscode from 'vscode';
import { URI as Uri } from 'vscode-uri';
import { Ply, Suite, Request, Case, Step, PlyOptions } from '@ply-ct/ply';

export class PlyLoader {
    private testsLocation: string;
    constructor(private readonly plyOptions: PlyOptions) {
        this.testsLocation = this.plyOptions.testsLocation;
    }

    async getSkipped(): Promise<Uri[]> {
        let skipped: Uri[] = [];
        if (this.plyOptions.skip) {
            skipped = await vscode.workspace.findFiles(
                new vscode.RelativePattern(this.testsLocation, this.plyOptions.skip)
            );
        }
        return skipped;
    }

    /**
     * Loads ply requests.
     * @returns a Map of location to Array of Requests
     */
    async loadRequests(): Promise<Map<Uri, Suite<Request>>> {
        const requestFileUris = await vscode.workspace.findFiles(
            new vscode.RelativePattern(this.testsLocation, this.plyOptions.requestFiles),
            new vscode.RelativePattern(this.testsLocation, this.plyOptions.ignore)
        );
        const requests = new Map<Uri, Suite<Request>>();
        const requestSuites = await new Ply(this.plyOptions).loadRequests(
            requestFileUris.map((fileUri) => fileUri.fsPath)
        );
        const skipped = await this.getSkipped();
        requestSuites.forEach((requestSuite) => {
            const suiteUri = Uri.file(this.plyOptions.testsLocation + '/' + requestSuite.path);
            if (skipped && skipped.find((s) => s.toString() === suiteUri.toString())) {
                requestSuite.skip = true;
            }
            requests.set(suiteUri, requestSuite);
        });
        return requests;
    }

    /**
     * Loads ply cases.
     */
    async loadCases(): Promise<Map<Uri, Suite<Case>>> {
        const caseFileUris = await vscode.workspace.findFiles(
            new vscode.RelativePattern(this.testsLocation, this.plyOptions.caseFiles),
            new vscode.RelativePattern(this.testsLocation, this.plyOptions.ignore)
        );
        const cases = new Map<Uri, Suite<Case>>();
        if (caseFileUris.length > 0) {
            const caseSuites = await new Ply(this.plyOptions).loadCases(
                caseFileUris.map((fileUri) => fileUri.fsPath)
            );
            const skipped = await this.getSkipped();
            caseSuites.forEach((caseSuite) => {
                const suiteUri = Uri.file(this.plyOptions.testsLocation + '/' + caseSuite.path);
                if (skipped && skipped.find((s) => s.toString() === suiteUri.toString())) {
                    caseSuite.skip = true;
                }
                cases.set(suiteUri, caseSuite);
            });
        }
        return cases;
    }

    /**
     * Loads ply flows.
     */
    async loadFlows(): Promise<Map<Uri, Suite<Step>>> {
        const flowFileUris = await vscode.workspace.findFiles(
            new vscode.RelativePattern(this.testsLocation, this.plyOptions.flowFiles),
            new vscode.RelativePattern(this.testsLocation, this.plyOptions.ignore)
        );
        const flows = new Map<Uri, Suite<Step>>();
        if (flowFileUris.length > 0) {
            const flowSuites = await new Ply(this.plyOptions).loadFlows(
                flowFileUris.map((fileUri) => fileUri.fsPath)
            );
            const skipped = await this.getSkipped();
            flowSuites.forEach((flowSuite) => {
                const suiteUri = Uri.file(this.plyOptions.testsLocation + '/' + flowSuite.path);
                if (skipped && skipped.find((s) => s.toString() === suiteUri.toString())) {
                    flowSuite.skip = true;
                }
                flows.set(suiteUri, flowSuite);
            });
        }
        return flows;
    }
}
