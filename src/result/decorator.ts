import * as vscode from 'vscode';
import { Range, Position } from 'vscode';
import * as ply from 'ply-ct';
import { DiffComputer } from './diffComputer';

export type ResultDiffs = {
    testId: string;
    start: number;  // TODO separate start for expected and actual
    end: number;
    diffs: ply.Diff[];
}

export type Ignored = {
    expected: vscode.DecorationOptions[];
    actual: vscode.DecorationOptions[];
}

export class ResultDecorator {

    private readonly ignoredDiffDecorator: vscode.TextEditorDecorationType;

    constructor() {
        const bg = new vscode.ThemeColor('editor.background');

        this.ignoredDiffDecorator = vscode.window.createTextEditorDecorationType({
            isWholeLine: false, // false actually overrides diff color
            backgroundColor: bg,
            opacity: '1.0',
            overviewRulerColor: bg
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
     * @param isActual
     */
    async applyDecorations(expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor, resultDiffs: ResultDiffs[], isActual = false) {

        const expectedLines = expectedEditor.document.getText().split(/\r?\n/);
        const actualLines = actualEditor.document.getText().split(/\r?\n/);

        let ignoredExpected: vscode.DecorationOptions[] = [];
        let ignoredActual: vscode.DecorationOptions[] = [];

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
                                            ignoredExpected.push({
                                                range: new Range(
                                                    new Position(line + charChange.originalStartLineNumber - 1, charChange.originalStartColumn - 1),
                                                    new Position(line + charChange.originalEndLineNumber - 1, charChange.originalEndColumn - 1)
                                                )
                                            });
                                            ignoredActual.push({
                                                range: new Range(
                                                    new Position(line + charChange.modifiedStartLineNumber - 1, charChange.modifiedStartColumn - 1),
                                                    new Position(line + charChange.modifiedEndLineNumber - 1, charChange.modifiedEndColumn - 1)
                                                )
                                            });
                                        }
                                    }
                                }
                            }
                            i++; // skip corresponding add
                        }
                    }
                    else if (!diff.added) {
                        // ignore trailing comments on both sides
                        const removedCodeLines = new ply.Code(removedLines, '#').lines;
                        const addedCodeLines = new ply.Code(addedLines, '#').lines;
                        for (let j = 0; j < removedCodeLines.length; j++) {
                            if (addedCodeLines.length > j) {
                                const removedCodeLine = removedCodeLines[j];
                                const addedCodeLine = addedCodeLines[j];
                                if (removedCodeLine.code === addedCodeLine.code) {
                                    // only differences are comments
                                    if (removedCodeLine.comment) {
                                        ignoredExpected.push({
                                            range: new Range(
                                                new Position(line + j, removedCodeLine.code.length),
                                                new Position(line + j, removedCodeLine.code.length + removedCodeLine.comment.length)
                                            )
                                        });
                                    }
                                    if (addedCodeLine.comment) {
                                        ignoredActual.push({
                                            range: new Range(
                                                new Position(line + j, addedCodeLine.code.length),
                                                new Position(line + j, addedCodeLine.code.length + addedCodeLine.comment.length)
                                            )
                                        });
                                    }
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
                const ignored = this.ignore(line, removedLines, addedLines);
                ignoredExpected = ignoredExpected.concat(ignored.expected);
                ignoredActual = ignoredActual.concat(ignored.actual);
            }
        }

        if (ignoredExpected.length > 0) {
            expectedEditor.setDecorations(this.ignoredDiffDecorator, ignoredExpected);
        }
        if (ignoredActual.length > 0) {
            actualEditor.setDecorations(this.ignoredDiffDecorator, ignoredActual);
        }
    }

    ignore(line: number, removedLines: string[], addedLines: string[]): Ignored {
        const expected: vscode.DecorationOptions[] = [];
        const actual: vscode.DecorationOptions[] = [];

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
                        expected.push({
                            range: new Range(
                                new Position(line + charChange.originalStartLineNumber - 1, charChange.originalStartColumn - 1),
                                new Position(line + charChange.originalEndLineNumber - 1, charChange.originalEndColumn - 1)
                            )
                        });
                    }
                    if (charChange.modifiedStartColumn && charChange.modifiedEndColumn) {
                        actual.push({
                            range: new Range(
                                new Position(line + charChange.modifiedStartLineNumber - 1, charChange.modifiedStartColumn - 1),
                                new Position(line + charChange.modifiedEndLineNumber - 1, charChange.modifiedEndColumn - 1)
                            )
                        });
                    }

                }
            }
        }
        return { expected, actual };
    }
}