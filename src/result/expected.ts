import * as vscode from 'vscode';
import { findExpressions } from '@ply-ct/ply-values';
import { PlyConfig } from '../config';
import { Result } from './result';

export class ExpectedResultsDecorator {
    private activeEditor?: vscode.TextEditor;
    private timeout?: NodeJS.Timer;
    private disposables: { dispose(): void }[] = [];
    static decoratorType: vscode.TextEditorDecorationType =
        vscode.window.createTextEditorDecorationType({
            light: {
                color: '#32cd32'
            },
            dark: {
                color: '#32cd32'
            }
        });

    constructor(readonly workspaceFolder: vscode.WorkspaceFolder, private config: PlyConfig) {
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                this.activeEditor = undefined;
                if (editor && this.isExpectedResultFile(editor.document.uri)) {
                    this.activeEditor = editor;
                    this.triggerUpdateDecorations();
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (this.activeEditor && event.document === this.activeEditor.document) {
                    this.triggerUpdateDecorations(true);
                }
            })
        );
    }

    private triggerUpdateDecorations(throttle = false) {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        if (throttle) {
            this.timeout = setTimeout(() => this.updateDecorations(), 500);
        } else {
            this.updateDecorations();
        }
    }

    private updateDecorations() {
        this.activeEditor?.setDecorations(
            ExpectedResultsDecorator.decoratorType,
            ExpectedResultsDecorator.getExpressionDecOptions(this.activeEditor.document)
        );
    }

    static getExpressionDecOptions(doc?: vscode.TextDocument): vscode.DecorationOptions[] {
        // TODO hover
        const decOptions: vscode.DecorationOptions[] = [];
        if (doc) {
            for (let i = 0; i < doc.lineCount; i++) {
                const line = doc.lineAt(i);
                for (const expression of findExpressions(line.text)) {
                    decOptions.push({
                        range: new vscode.Range(
                            new vscode.Position(i, expression.start),
                            new vscode.Position(i, expression.end + 1)
                        )
                    });
                }
            }
        }
        return decOptions;
    }

    private isExpectedResultFile(uri: vscode.Uri): boolean {
        if (
            (uri.scheme === Result.URI_SCHEME || uri.scheme === 'file') &&
            (uri.path.endsWith('.yaml') || uri.path.endsWith('.yml'))
        ) {
            return uri.path.startsWith(this.config.plyOptions.expectedLocation);
        }
        return false;
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
