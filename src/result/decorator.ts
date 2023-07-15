import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { DiffComputer } from '../vscode/diffComputer';
import { ExpectedResultsDecorator } from './expected';

export type ResultDiffs = {
    testId: string;
    expectedStart: number;
    expectedEnd: number;
    actualStart: number;
    actualEnd: number;
    diffs: ply.Diff[];
};

class Decorations {
    expected: vscode.DecorationOptions[] = [];
    actual: vscode.DecorationOptions[] = [];

    applyExpected(start: vscode.Position, end: vscode.Position) {
        this.expected.push({ range: new vscode.Range(start, end) });
    }

    applyActual(start: vscode.Position, end: vscode.Position) {
        this.actual.push({ range: new vscode.Range(start, end) });
    }

    undiff(
        expectedLineNo: number,
        actualLineNo: number,
        expectedLines: string[],
        actualLines: string[]
    ) {
        const diffComputer = new DiffComputer(expectedLines, actualLines, {
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
                    // zero line/column indicates changes are only on the other side (1-based)
                    const originalStartLine =
                        charChange.originalStartLineNumber ||
                        charChange.modifiedStartLineNumber ||
                        1;
                    const originalStartColumn = charChange.originalStartColumn || 1;
                    const originalEndLine =
                        charChange.originalEndLineNumber || charChange.modifiedEndLineNumber || 1;
                    const originalEndColumn = charChange.originalEndColumn || 1;
                    this.applyExpected(
                        new vscode.Position(
                            expectedLineNo + originalStartLine - 1,
                            originalStartColumn - 1
                        ),
                        new vscode.Position(
                            expectedLineNo + originalEndLine - 1,
                            originalEndColumn - 1
                        )
                    );

                    const modifiedStartLine =
                        charChange.modifiedStartLineNumber ||
                        charChange.originalStartLineNumber ||
                        1;
                    const modifiedStartColumn = charChange.modifiedStartColumn || 1;
                    const modifiedEndLine =
                        charChange.modifiedEndLineNumber || charChange.originalEndLineNumber || 1;
                    const modifiedEndColumn = charChange.modifiedEndColumn || 1;
                    this.applyActual(
                        new vscode.Position(
                            actualLineNo + modifiedStartLine - 1,
                            modifiedStartColumn - 1
                        ),
                        new vscode.Position(
                            actualLineNo + modifiedEndLine - 1,
                            modifiedEndColumn - 1
                        )
                    );
                }
            }
        }
    }

    warn(
        expectedLineNo: number,
        actualLineNo: number,
        removedLines: string[],
        addedLines: string[]
    ) {
        removedLines.forEach((_, i) => {
            this.applyExpected(
                new vscode.Position(expectedLineNo + i, 0),
                new vscode.Position(expectedLineNo + i, 0)
            );
        }, this);

        addedLines.forEach((_, i) => {
            this.applyActual(
                new vscode.Position(actualLineNo + i, 0),
                new vscode.Position(actualLineNo + i, 0)
            );
        });
    }
}

export class ResultDecorator {
    private disposables: { dispose(): void }[] = [];

    private readonly ignoredDiffDecorator: vscode.TextEditorDecorationType;
    private readonly legitDiffDecorator: vscode.TextEditorDecorationType;
    private readonly noDiffStateDecorator: vscode.TextEditorDecorationType;

    constructor(contextPath: string) {
        const bg = new vscode.ThemeColor('editor.background');

        this.ignoredDiffDecorator = vscode.window.createTextEditorDecorationType({
            isWholeLine: false, // false actually overrides diff color
            backgroundColor: bg,
            opacity: '1.0',
            overviewRulerColor: bg,
            dark: {
                gutterIconPath: `${contextPath}/icons/dark/check.svg`
            },
            light: {
                gutterIconPath: `${contextPath}/icons/light/check.svg`
            }
        });
        this.disposables.push(this.ignoredDiffDecorator);

        this.legitDiffDecorator = vscode.window.createTextEditorDecorationType({
            dark: {
                gutterIconPath: `${contextPath}/icons/dark/error.svg`
            },
            light: {
                gutterIconPath: `${contextPath}/icons/light/error.svg`
            }
        });
        this.disposables.push(this.legitDiffDecorator);

        this.noDiffStateDecorator = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' # NOTE: Run tests before comparing results'
            },
            dark: {
                gutterIconPath: `${contextPath}/icons/dark/warning.svg`
            },
            light: {
                gutterIconPath: `${contextPath}/icons/light/warning.svg`
            }
        });
        this.disposables.push(this.noDiffStateDecorator);
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }

    /**
     * @param expectedEditor
     * @param actualEditor
     * @param resultDiffs
     */
    applyDecorations(
        expectedEditor: vscode.TextEditor,
        actualEditor: vscode.TextEditor,
        resultDiffs: ResultDiffs[]
    ) {
        const ignoredDecorations = new Decorations();
        const legitDecorations = new Decorations();

        const expectedAll = ply.util.lines(expectedEditor.document.getText());
        const actualAll = ply.util.lines(actualEditor.document.getText());

        if (expectedAll.length > 0) {
            const warningDecorations = [];
            if (resultDiffs.length === 0) {
                const char = expectedAll[0].length;
                warningDecorations.push({
                    range: new vscode.Range(
                        new vscode.Position(0, char),
                        new vscode.Position(0, char)
                    )
                });
            }
            expectedEditor.setDecorations(this.noDiffStateDecorator, warningDecorations);
        }

        for (const resultDiff of resultDiffs) {
            let expectedLineNo = resultDiff.expectedStart;
            let actualLineNo = resultDiff.actualStart;
            if (resultDiff.diffs.length > 0) {
                for (let i = 0; i < resultDiff.diffs.length; i++) {
                    const diff = resultDiff.diffs[i];
                    const expectedLines = expectedAll.slice(
                        expectedLineNo,
                        expectedLineNo + diff.count
                    );
                    const actualLines = actualAll.slice(actualLineNo, actualLineNo + diff.count);
                    // TODO: what if running line count is different for expected vs actual (see ply compare code)
                    if (diff.removed && i < resultDiff.diffs.length - 1) {
                        const nextDiff = resultDiff.diffs[i + 1];
                        if (nextDiff.added) {
                            // has corresponding add
                            if (diff.ignored && nextDiff.ignored) {
                                ignoredDecorations.undiff(
                                    expectedLineNo,
                                    actualLineNo,
                                    expectedLines,
                                    actualLines
                                );
                            } else {
                                // diff not ignored
                                legitDecorations.warn(
                                    expectedLineNo,
                                    actualLineNo,
                                    expectedLines,
                                    actualLines
                                );
                            }
                            i++; // skip corresponding add
                            expectedLineNo += diff.count;
                            actualLineNo += diff.count;
                        } else {
                            // straight removal
                            legitDecorations.warn(expectedLineNo, actualLineNo, expectedLines, []);
                            expectedLineNo += diff.count;
                        }
                    } else {
                        if (diff.added) {
                            // added without previous remove
                            legitDecorations.warn(expectedLineNo, actualLineNo, [], actualLines);
                            actualLineNo += diff.count;
                        } else {
                            // no diff could be because comments were ignored, do the same here
                            // (ignore trailing comments on both sides)
                            const expectedCodeLines = new ply.Code(expectedLines, '#').lines;
                            const actualCodeLines = new ply.Code(actualLines, '#').lines;
                            for (let j = 0; j < expectedCodeLines.length; j++) {
                                if (actualCodeLines.length > j) {
                                    const expectedCodeLine = expectedCodeLines[j];
                                    const actualCodeLine = actualCodeLines[j];
                                    if (expectedCodeLine.code === actualCodeLine.code) {
                                        // the only differences are comments
                                        ignoredDecorations.undiff(
                                            expectedLineNo + j,
                                            actualLineNo + j,
                                            [
                                                expectedCodeLine.code +
                                                    (expectedCodeLine.comment || '')
                                            ],
                                            [actualCodeLine.code + (actualCodeLine.comment || '')]
                                        );
                                    } else {
                                        legitDecorations.warn(
                                            expectedLineNo + j,
                                            actualLineNo + j,
                                            [
                                                expectedCodeLine.code +
                                                    (expectedCodeLine.comment || '')
                                            ],
                                            [actualCodeLine.code + (actualCodeLine.comment || '')]
                                        );
                                    }
                                }
                            }
                            expectedLineNo += diff.count;
                            actualLineNo += diff.count;
                        }
                    }
                }
            } else {
                const expectedLines = expectedAll.slice(expectedLineNo, resultDiff.expectedEnd);
                const actualLines = actualAll.slice(actualLineNo, resultDiff.actualEnd);
                ignoredDecorations.undiff(expectedLineNo, actualLineNo, expectedLines, actualLines);
            }
        }

        expectedEditor.setDecorations(this.ignoredDiffDecorator, ignoredDecorations.expected);
        actualEditor.setDecorations(this.ignoredDiffDecorator, ignoredDecorations.actual);
        expectedEditor.setDecorations(this.legitDiffDecorator, legitDecorations.expected);
        actualEditor.setDecorations(this.legitDiffDecorator, legitDecorations.actual);
        const exprDecs = ExpectedResultsDecorator.getExpressionDecOptions(expectedEditor.document);
        expectedEditor.setDecorations(ExpectedResultsDecorator.decoratorType, exprDecs);
    }
}
