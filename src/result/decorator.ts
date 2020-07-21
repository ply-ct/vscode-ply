import * as vscode from 'vscode';
import { Range, Position } from 'vscode';
import * as ply from 'ply-ct';
import { DiffComputer } from '../vscode/diffComputer';

export type ResultDiffs = {
    testId: string;
    start: number;  // TODO separate start for expected and actual
    end: number;
    diffs: ply.Diff[];
}

class Decorations {
    expected: vscode.DecorationOptions[] = [];
    actual: vscode.DecorationOptions[] = [];
}

export class ResultDecorator {

    private ignored = new Decorations();
    private legit = new Decorations();

    private readonly ignoredDiffDecorator: vscode.TextEditorDecorationType;
    private readonly legitDiffDecorator: vscode.TextEditorDecorationType;

    constructor(context: vscode.ExtensionContext) {
        const bg = new vscode.ThemeColor('editor.background');

        this.ignoredDiffDecorator = vscode.window.createTextEditorDecorationType({
            isWholeLine: false, // false actually overrides diff color
            backgroundColor: bg,
            opacity: '1.0',
            overviewRulerColor: bg,
            dark: {
                gutterIconPath: context.asAbsolutePath('icons/check-dark.svg')
            },
            light: {
                gutterIconPath: context.asAbsolutePath('icons/check-light.svg')
            }
        });

        this.legitDiffDecorator = vscode.window.createTextEditorDecorationType({
            dark: {
                gutterIconPath: context.asAbsolutePath('icons/error-dark.svg')
            },
            light: {
                gutterIconPath: context.asAbsolutePath('icons/error-light.svg')
            }
        });
    }

    dispose() {
    }

    /**
     * TODO handle removed without corresponding add, as well as just plain added
     * TODO set DecoratorOptions.hoverMessage to be expression evaluation result
     * @param expectedEditor
     * @param actualEditor
     * @param resultDiffs
     */
    async applyDecorations(expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor, resultDiffs: ResultDiffs[]) {

        const expectedLines = expectedEditor.document.getText().split(/\r?\n/);
        const actualLines = actualEditor.document.getText().split(/\r?\n/);

        for (const resultDiff of resultDiffs) {
            let line = resultDiff.start;
            if (resultDiff.diffs.length > 0) {
                for (let i = 0; i < resultDiff.diffs.length; i++) {
                    const diff = resultDiff.diffs[i];
                    const removedLines = expectedLines.slice(line, line + diff.count);
                    const addedLines = actualLines.slice(line, line + diff.count);
                    // TODO: what if running line count is different for expected vs actual (see ply compare code)
                    if (diff.removed && i < resultDiff.diffs.length - 1) {
                        const nextDiff = resultDiff.diffs[i + 1];
                        if (nextDiff.added) {
                            if (diff.ignored && nextDiff.ignored) {
                                this.ignore(line, removedLines, addedLines);
                            }
                            else {
                                this.legitimize(line, removedLines, addedLines);
                            }
                            i++; // skip corresponding add
                        }
                    }
                    else if (!diff.added) {  // TODO: added without previous removed
                        // ignore trailing comments on both sides
                        const removedCodeLines = new ply.Code(removedLines, '#').lines;
                        const addedCodeLines = new ply.Code(addedLines, '#').lines;
                        for (let j = 0; j < removedCodeLines.length; j++) {
                            if (addedCodeLines.length > j) {
                                const removedCodeLine = removedCodeLines[j];
                                const addedCodeLine = addedCodeLines[j];
                                if (removedCodeLine.code === addedCodeLine.code) {
                                    // the only differences are comments
                                    this.ignore(
                                        line + j,
                                        [removedCodeLine.code + removedCodeLine.comment || ''],
                                        [addedCodeLine.code + addedCodeLine.comment || '']
                                    );
                                }
                                else {
                                    this.legitimize(
                                        line + j,
                                        [removedCodeLine.code + removedCodeLine.comment || ''],
                                        [addedCodeLine.code + addedCodeLine.comment || '']
                                    );
                                }
                            }
                        }
                    }
                    line += diff.count;
                }
            }
            else {
                // all diffs ignored
                const removedLines = expectedLines.slice(line, resultDiff.end);
                const addedLines = actualLines.slice(line, resultDiff.end);
                this.ignore(line, removedLines, addedLines);
            }
        }

        if (this.ignored.expected.length > 0) {
            expectedEditor.setDecorations(this.ignoredDiffDecorator, this.ignored.expected);
        }
        if (this.ignored.actual.length > 0) {
            actualEditor.setDecorations(this.ignoredDiffDecorator, this.ignored.actual);
        }
        if (this.legit.expected.length > 0) {
            expectedEditor.setDecorations(this.legitDiffDecorator, this.legit.expected);
        }
        if (this.legit.actual.length > 0) {
            actualEditor.setDecorations(this.legitDiffDecorator, this.legit.actual);
        }
    }

    private ignore(line: number, removedLines: string[], addedLines: string[]) {

        const diffComputer = new DiffComputer(removedLines, addedLines, {
            shouldComputeCharChanges: true,
            shouldPostProcessCharChanges: true,
            shouldIgnoreTrimWhitespace: true,
            shouldMakePrettyDiff: true,
            maxComputationTime: 0
        });

        const changes = diffComputer.computeDiff().changes;
        // TODO check whether charChange.originalStartLineNumber adjustment below correctly handles multi-line diffs
        for (const change of changes) {
            if (change.charChanges) {
                for (const charChange of change.charChanges) {
                    // zero start/end column indicates changes are only on the other side
                    if (charChange.originalStartColumn && charChange.originalEndColumn) {
                        this.ignored.expected.push({
                            range: new Range(
                                new Position(line + charChange.originalStartLineNumber - 1, charChange.originalStartColumn - 1),
                                new Position(line + charChange.originalEndLineNumber - 1, charChange.originalEndColumn - 1)
                            )
                        });
                    }
                    if (charChange.modifiedStartColumn && charChange.modifiedEndColumn) {
                        this.ignored.actual.push({
                            range: new Range(
                                new Position(line + charChange.modifiedStartLineNumber - 1, charChange.modifiedStartColumn - 1),
                                new Position(line + charChange.modifiedEndLineNumber - 1, charChange.modifiedEndColumn - 1)
                            )
                        });
                    }

                }
            }
        }
    }

    legitimize(line: number, removedLines: string[], addedLines: string[]) {
        removedLines.forEach((_, i) => {
            this.legit.expected.push({
                range: new Range(
                    new Position(line + i, 0),
                    new Position(line + i, 0)
                )
            });
        }, this);

        addedLines.forEach((_, i) => {
            this.legit.actual.push({
                range: new Range(
                    new Position(line + i, 0),
                    new Position(line + i, 0)
                )
            });
        });
    }
}