import * as vscode from 'vscode';
import * as ply from 'ply-ct';
import { DiffComputer } from '../vscode/diffComputer';

export type ResultDiffs = {
    testId: string;
    expectedStart: number;
    expectedEnd: number;
    actualStart: number;
    actualEnd: number;
    diffs: ply.Diff[];
}

class Decorations {
    expected: vscode.DecorationOptions[] = [];
    actual: vscode.DecorationOptions[] = [];

    applyExpected(start: vscode.Position, end: vscode.Position) {
        this.expected.push({ range: new vscode.Range(start, end) });
    }

    applyActual(start: vscode.Position, end: vscode.Position) {
        this.actual.push({ range: new vscode.Range(start, end) });
    }

}

export class ResultDecorator {

    private ignored = new Decorations();
    private legit = new Decorations();

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
                gutterIconPath: `${contextPath}/icons/check-dark.svg`
            },
            light: {
                gutterIconPath: `${contextPath}/icons/check-light.svg`
            }
        });

        this.legitDiffDecorator = vscode.window.createTextEditorDecorationType({
            dark: {
                gutterIconPath: `${contextPath}/icons/error-dark.svg`
            },
            light: {
                gutterIconPath: `${contextPath}/icons/error-light.svg`
            }
        });

        this.noDiffStateDecorator = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' # NOTE: Run tests before comparing results'
            },
            dark: {
                gutterIconPath: `${contextPath}/icons/warning-dark.svg`
            },
            light: {
                gutterIconPath: `${contextPath}/icons/warning-light.svg`
            }
        });
    }

    dispose() {
    }

    /**
     * @param expectedEditor
     * @param actualEditor
     * @param resultDiffs
     */
    applyDecorations(expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor, resultDiffs: ResultDiffs[]) {

        const expectedAll = ply.util.lines(expectedEditor.document.getText());
        const actualAll = ply.util.lines(actualEditor.document.getText());

        if (expectedAll.length > 0) {
            const warningDecorations = [];
            if (resultDiffs.length === 0) {
                const char = expectedAll[0].length;
                warningDecorations.push({ range: new vscode.Range(new vscode.Position(0, char), new vscode.Position(0, char))});
            }
            expectedEditor.setDecorations(this.noDiffStateDecorator, warningDecorations);
        }

        for (const resultDiff of resultDiffs) {
            let expectedLineNo = resultDiff.expectedStart;
            let actualLineNo = resultDiff.actualStart;
            if (resultDiff.diffs.length > 0) {
                for (let i = 0; i < resultDiff.diffs.length; i++) {
                    const diff = resultDiff.diffs[i];
                    const expectedLines = expectedAll.slice(expectedLineNo, expectedLineNo + diff.count);
                    const actualLines = actualAll.slice(actualLineNo, actualLineNo + diff.count);
                    // TODO: what if running line count is different for expected vs actual (see ply compare code)
                    if (diff.removed && i < resultDiff.diffs.length - 1) {
                        const nextDiff = resultDiff.diffs[i + 1];
                        if (nextDiff.added) {
                            // has corresponding add
                            if (diff.ignored && nextDiff.ignored) {
                                this.ignore(expectedLineNo, actualLineNo, expectedLines, actualLines);
                            }
                            else {
                                // diff not ignored
                                this.legitimize(expectedLineNo, actualLineNo, expectedLines, actualLines);
                            }
                            i++; // skip corresponding add
                            expectedLineNo += diff.count;
                            actualLineNo += diff.count;
                        }
                        else {
                            // straight removal
                            this.legitimize(expectedLineNo, actualLineNo, expectedLines, []);
                            expectedLineNo += diff.count;
                        }
                    }
                    else {
                        if (diff.added) {
                            // added without previous remove
                            this.legitimize(expectedLineNo, actualLineNo, [], actualLines);
                            actualLineNo += diff.count;
                        }
                        else {
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
                                        this.ignore(
                                            expectedLineNo + j,
                                            actualLineNo + j,
                                            [expectedCodeLine.code + expectedCodeLine.comment || ''],
                                            [actualCodeLine.code + actualCodeLine.comment || '']
                                        );
                                    }
                                    else {
                                        this.legitimize(
                                            expectedLineNo + j,
                                            actualLineNo + j,
                                            [expectedCodeLine.code + expectedCodeLine.comment || ''],
                                            [actualCodeLine.code + actualCodeLine.comment || '']
                                        );
                                    }
                                }
                            }
                            expectedLineNo += diff.count;
                            actualLineNo += diff.count;
                        }
                    }
                }
            }
            else {
                // all diffs ignored
                const expectedLines = expectedAll.slice(expectedLineNo, resultDiff.expectedEnd);
                const actualLines = actualAll.slice(actualLineNo, resultDiff.actualEnd);
                this.ignore(expectedLineNo, actualLineNo, expectedLines, actualLines);
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

    private ignore(expectedLineNo: number, actualLineNo: number, expectedLines: string[], actualLines: string[]) {

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
                    const originalStartLine = (charChange.originalStartLineNumber || charChange.modifiedStartLineNumber) || 1;
                    const originalStartColumn = charChange.originalStartColumn || 1;
                    const originalEndLine = (charChange.originalEndLineNumber || charChange.modifiedEndLineNumber) || 1;
                    const originalEndColumn = charChange.originalEndColumn || 1;
                    this.ignored.applyExpected(
                        new vscode.Position(expectedLineNo + originalStartLine - 1, originalStartColumn - 1),
                        new vscode.Position(expectedLineNo + originalEndLine - 1, originalEndColumn - 1)
                    );

                    const modifiedStartLine = (charChange.modifiedStartLineNumber || charChange.originalStartLineNumber) || 1;
                    const modifiedStartColumn = charChange.modifiedStartColumn || 1;
                    const modifiedEndLine = (charChange.modifiedEndLineNumber || charChange.originalEndLineNumber) || 1;
                    const modifiedEndColumn = charChange.modifiedEndColumn || 1;
                    this.ignored.applyActual(
                        new vscode.Position(actualLineNo + modifiedStartLine - 1, modifiedStartColumn - 1),
                        new vscode.Position(actualLineNo + modifiedEndLine - 1, modifiedEndColumn - 1)
                    );
                }
            }
        }
    }

    legitimize(expectedLineNo: number, actualLineNo: number, removedLines: string[], addedLines: string[]) {
        removedLines.forEach((_, i) => {
            this.legit.applyExpected(new vscode.Position(expectedLineNo + i, 0), new vscode.Position(expectedLineNo + i, 0));
        }, this);

        addedLines.forEach((_, i) => {
            this.legit.applyActual(new vscode.Position(actualLineNo + i, 0), new vscode.Position(actualLineNo + i, 0));
        });
    }
}