import * as vscode from 'vscode';
import { PlyExplorer } from '../ply-explorer';
import { stateIcon, parentNodeState, StateIconType } from './tree/state';
import { StateDecorationTypes } from './stateDecorationTypes';
import { TestCollection } from './tree/testCollection';
import { allTests } from './util';

export class Decorator {
    private readonly stateDecorationTypes: StateDecorationTypes;
    private readonly errorDecorationType: vscode.TextEditorDecorationType;

    private filesWithCurrentDecorations = new Set<string>();
    private timeout: NodeJS.Timer | undefined;

    constructor(context: vscode.ExtensionContext, private readonly testExplorer: PlyExplorer) {
        this.stateDecorationTypes = new StateDecorationTypes(context, this.testExplorer.iconPaths);
        this.errorDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('ply.explorer.errorDecorationBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('ply.explorer.errorDecorationBackground')
        });
        context.subscriptions.push(this.errorDecorationType);

        context.subscriptions.push(
            vscode.window.onDidChangeVisibleTextEditors(() => {
                this.updateAllDecorations();
            })
        );

        this.updateDecorationsNow();
    }

    updateDecorationsFor(fileUri: string): void {
        if (!this.filesWithCurrentDecorations.has(fileUri)) return;

        this.filesWithCurrentDecorations.delete(fileUri);

        if (!this.timeout) {
            this.timeout = setTimeout(() => {
                this.timeout = undefined;
                this.updateDecorationsNow();
            }, 200);
        }
    }

    updateAllDecorations(): void {
        this.filesWithCurrentDecorations.clear();

        this.updateDecorationsNow();
    }

    private updateDecorationsNow(): void {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }

        const newFilesWithCurrentDecorations = new Set<string>();
        for (const textEditor of vscode.window.visibleTextEditors) {
            const fileUri = textEditor.document.uri.toString();

            if (!this.filesWithCurrentDecorations.has(fileUri)) {
                this.setDecorations(textEditor);
            }

            newFilesWithCurrentDecorations.add(fileUri);
        }

        this.filesWithCurrentDecorations = newFilesWithCurrentDecorations;
    }

    private setDecorations(textEditor: vscode.TextEditor): void {
        const fileUri = textEditor.document.uri.toString();

        const decorations = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
        for (const decorationType of this.stateDecorationTypes.all) {
            decorations.set(decorationType, []);
        }
        decorations.set(this.errorDecorationType, []);

        for (const collection of this.testExplorer.collections.values()) {
            this.addStateDecorations(collection, fileUri, decorations);
            this.addErrorDecorations(collection, fileUri, decorations);
        }

        for (const [decorationType, decorationOptions] of decorations) {
            textEditor.setDecorations(decorationType, decorationOptions);
        }
    }

    private addStateDecorations(
        collection: TestCollection,
        fileUri: string,
        decorations: Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>
    ): void {
        if (collection.shouldShowGutterDecoration()) {
            const locatedNodes = collection.getLocatedNodes(fileUri);
            if (locatedNodes) {
                for (const [line, treeNodes] of locatedNodes) {
                    let stateIconType: StateIconType;
                    if (treeNodes.length === 1) {
                        stateIconType = stateIcon(treeNodes[0]!.state, treeNodes[0]!.info.id);
                    } else {
                        stateIconType = stateIcon(
                            parentNodeState(treeNodes),
                            treeNodes[0]!.info.id
                        );
                    }

                    const decorationType = this.stateDecorationTypes[stateIconType];
                    const decoration = decorations.get(decorationType);
                    if (decoration) {
                        decoration.push({
                            range: new vscode.Range(line, 0, line, 0)
                        });
                    } else {
                        // maybe a race condition (Unable to get decoration: pendingCase)
                        // console.error(`Unable to get decoration: ${stateIconType}`);
                    }
                }
            }
        }
    }

    private addErrorDecorations(
        collection: TestCollection,
        fileUri: string,
        decorations: Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>
    ): void {
        if (collection.shouldShowErrorDecoration() && collection.suite) {
            for (const testNode of allTests(collection.suite)) {
                if (testNode.fileUri === fileUri) {
                    for (const decoration of testNode.decorations) {
                        decorations.get(this.errorDecorationType)!.push({
                            range: new vscode.Range(decoration.line, 0, decoration.line, 0),
                            renderOptions: {
                                after: {
                                    contentText: ` // ${decoration.message}`
                                }
                            }
                        });
                    }
                }
            }
        }
    }
}
