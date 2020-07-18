import * as vscode from 'vscode';
import { Range, Position } from 'vscode';
import * as ply from 'ply-ct';
import { stringDiff } from './diff';
import { DiffComputer } from './diffComputer';

export type ResultDiffs = {
    testId: string;
    diffs: ply.Diff[];
}

export class ResultDecorator {

    private readonly ignoredDiffDecorator: vscode.TextEditorDecorationType;

    constructor() {
        const bg = new vscode.ThemeColor('editor.background');

        this.ignoredDiffDecorator = vscode.window.createTextEditorDecorationType({
            isWholeLine: false, // false actually overrides diff color
            backgroundColor: bg,
            opacity: '1.0',
            overviewRulerColor: bg,

        });
    }

    dispose() {
    }

    async applyDecorations(expectedEditor: vscode.TextEditor, actualEditor: vscode.TextEditor, resultDiffs: ResultDiffs[], isActual = false) {

        // TODO pass DecoratorOptions instead of straight Range to set hover to be expression evaluation result
        const ignoredExpected: vscode.DecorationOptions[] = [];
        const ignoredActual: vscode.DecorationOptions[] = [];

        let line = 0;
        for (const resultDiff of resultDiffs) {
            for (let i = 0; i < resultDiff.diffs.length; i++) {
                const diff = resultDiff.diffs[i];
                if (diff.removed && diff.ignored && i < resultDiff.diffs.length - 1) {
                    const nextDiff = resultDiff.diffs[i + 1];
                    if (nextDiff.added) {
                        if (nextDiff.ignored) {
                            const removedLines = diff.value.split(/\r?\n/);
                            const addedLines = nextDiff.value.split(/\r?\n/);

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
                        else {
                            // TODO ignore trailing comments on both sides
                        }
                    }
                }
                line += diff.count;
            }
        }

        if (ignoredExpected.length > 0) {
            expectedEditor.setDecorations(this.ignoredDiffDecorator, ignoredExpected);
        }
        if (ignoredActual.length > 0) {
            console.log("IGNORED ACTUAL: " + JSON.stringify(ignoredActual, null, 2));
            actualEditor.setDecorations(this.ignoredDiffDecorator, ignoredActual);
        }
    }
}