import * as vscode from 'vscode';
import { Values, ValuesHolder, findExpressions } from '@ply-ct/ply-values';
import { PlyAdapter } from '../adapter';
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

    constructor(readonly workspaceFolder: vscode.WorkspaceFolder, private adapter: PlyAdapter) {
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

    private async updateDecorations() {
        if (this.activeEditor) {
            const suiteId = this.adapter.plyRoots.getSuiteIdForExpectedResult(
                this.activeEditor.document.uri
            );
            const valuesHolders = suiteId
                ? await this.adapter.values?.getValuesHolders(suiteId)
                : undefined;
            this.activeEditor.setDecorations(
                ExpectedResultsDecorator.decoratorType,
                ExpectedResultsDecorator.getExpressionDecOptions(
                    this.adapter.workspaceFolder,
                    this.activeEditor.document,
                    valuesHolders
                )
            );
        }
    }

    static getExpressionDecOptions(
        workspaceFolder: vscode.WorkspaceFolder,
        doc?: vscode.TextDocument,
        valuesHolders: ValuesHolder[] = []
    ): vscode.DecorationOptions[] {
        // TODO hover
        const decOptions: vscode.DecorationOptions[] = [];
        if (doc) {
            const valuesAccess = new Values(valuesHolders, {
                trusted: vscode.workspace.isTrusted,
                refHolder: '__ply_results',
                env: process.env,
                logger: console
            });
            for (let i = 0; i < doc.lineCount; i++) {
                const line = doc.lineAt(i);
                for (const expression of findExpressions(line.text)) {
                    const mds: vscode.MarkdownString[] = [];

                    const value = valuesAccess.getValue(expression.text);
                    if (value?.value) {
                        mds.push(new vscode.MarkdownString(`Value: \`${value.value}\``));
                        if (value.location) {
                            const fileUri = `${workspaceFolder.uri.fsPath}/${value.location.path}`;
                            mds.push(
                                new vscode.MarkdownString(
                                    `From: [${value.location.path}](${fileUri})`
                                )
                            );
                        }
                    } else {
                        mds.push(new vscode.MarkdownString('Not found: `' + expression.text + '`'));
                    }

                    decOptions.push({
                        range: new vscode.Range(
                            new vscode.Position(i, expression.start),
                            new vscode.Position(i, expression.end + 1)
                        ),
                        hoverMessage: mds.map((md: vscode.MarkdownString) => {
                            md.isTrusted = vscode.workspace.isTrusted;
                            md.supportHtml = true;
                            return md;
                        })
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
            return uri.path.startsWith(this.adapter.config.plyOptions.expectedLocation);
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
