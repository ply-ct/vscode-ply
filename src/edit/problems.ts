import * as vscode from 'vscode';

export enum MarkerSeverity {
    Hint = 1,
    Info = 2,
    Warning = 4,
    Error = 8
}

export interface Marker {
    source: 'json' | 'yaml';
    owner: 'json' | 'yaml';
    code: string;
    severity: MarkerSeverity;
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export class Problems {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(readonly uri: vscode.Uri) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection(
            this.uri.toString()
        );
    }

    getDiagnosticSeverity(markerSeverity: MarkerSeverity): vscode.DiagnosticSeverity {
        switch (markerSeverity) {
            case MarkerSeverity.Hint:
                return vscode.DiagnosticSeverity.Hint;
            case MarkerSeverity.Info:
                return vscode.DiagnosticSeverity.Information;
            case MarkerSeverity.Warning:
                return vscode.DiagnosticSeverity.Warning;
            case MarkerSeverity.Error:
                return vscode.DiagnosticSeverity.Error;
        }
    }

    show(resource: string, markers: Marker[]) {
        const diagnostics: vscode.Diagnostic[] = [];
        for (const marker of markers) {
            diagnostics.push(
                new vscode.Diagnostic(
                    new vscode.Range(
                        new vscode.Position(marker.startLineNumber - 1, marker.startColumn - 1),
                        new vscode.Position(marker.endLineNumber - 1, marker.endColumn - 1)
                    ),
                    `${resource} (${marker.source}): ${marker.message}`,
                    this.getDiagnosticSeverity(marker.severity)
                )
            );
        }
        this.diagnosticCollection.set(this.uri, diagnostics);
    }

    clear() {
        this.diagnosticCollection.clear();
    }
}
