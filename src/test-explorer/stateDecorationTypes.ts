import * as vscode from 'vscode';
import { IconPaths, IconPath } from './iconPaths';

export class StateDecorationTypes {
    readonly pendingCategory: vscode.TextEditorDecorationType;
    readonly pendingFolder: vscode.TextEditorDecorationType;
    readonly pendingRequest: vscode.TextEditorDecorationType;
    readonly pendingTest: vscode.TextEditorDecorationType;
    readonly pendingFlow: vscode.TextEditorDecorationType;
    readonly pendingStep: vscode.TextEditorDecorationType;
    readonly pendingStart: vscode.TextEditorDecorationType;
    readonly pendingStop: vscode.TextEditorDecorationType;
    readonly pendingDecide: vscode.TextEditorDecorationType;
    readonly pendingDelay: vscode.TextEditorDecorationType;
    readonly pendingCase: vscode.TextEditorDecorationType;
    readonly pendingMethod: vscode.TextEditorDecorationType;
    readonly pendingAutorun: vscode.TextEditorDecorationType;
    readonly scheduled: vscode.TextEditorDecorationType;
    readonly running: vscode.TextEditorDecorationType;
    readonly runningFailed: vscode.TextEditorDecorationType;
    readonly passed: vscode.TextEditorDecorationType;
    readonly failed: vscode.TextEditorDecorationType;
    readonly passedFaint: vscode.TextEditorDecorationType;
    readonly failedFaint: vscode.TextEditorDecorationType;
    readonly passedAutorun: vscode.TextEditorDecorationType;
    readonly failedAutorun: vscode.TextEditorDecorationType;
    readonly passedFaintAutorun: vscode.TextEditorDecorationType;
    readonly failedFaintAutorun: vscode.TextEditorDecorationType;
    readonly skipped: vscode.TextEditorDecorationType;
    readonly duplicate: vscode.TextEditorDecorationType;
    readonly errored: vscode.TextEditorDecorationType;
    readonly erroredFaint: vscode.TextEditorDecorationType;

    readonly all: vscode.TextEditorDecorationType[];

    constructor(context: vscode.ExtensionContext, iconPaths: IconPaths) {
        this.pendingCategory = toDecorationType(iconPaths.pendingCategory);
        this.pendingFolder = toDecorationType(iconPaths.pendingFolder);
        this.pendingRequest = toDecorationType(iconPaths.pendingRequest);
        this.pendingTest = toDecorationType(iconPaths.pendingTest);
        this.pendingFlow = toDecorationType(iconPaths.pendingFlow);
        this.pendingStep = toDecorationType(iconPaths.pendingStep);
        this.pendingStart = toDecorationType(iconPaths.pendingStart);
        this.pendingStop = toDecorationType(iconPaths.pendingStop);
        this.pendingDecide = toDecorationType(iconPaths.pendingDecide);
        this.pendingDelay = toDecorationType(iconPaths.pendingDelay);
        this.pendingCase = toDecorationType(iconPaths.pendingCase);
        this.pendingMethod = toDecorationType(iconPaths.pendingMethod);
        this.pendingAutorun = toDecorationType(iconPaths.pendingAutorun);
        this.scheduled = toDecorationType(iconPaths.scheduled);
        this.running = toDecorationType(iconPaths.running);
        this.runningFailed = toDecorationType(iconPaths.runningFailed);
        this.passed = toDecorationType(iconPaths.passed);
        this.failed = toDecorationType(iconPaths.failed);
        this.passedFaint = toDecorationType(iconPaths.passedFaint);
        this.failedFaint = toDecorationType(iconPaths.failedFaint);
        this.passedAutorun = toDecorationType(iconPaths.passedAutorun);
        this.failedAutorun = toDecorationType(iconPaths.failedAutorun);
        this.passedFaintAutorun = toDecorationType(iconPaths.passedFaintAutorun);
        this.failedFaintAutorun = toDecorationType(iconPaths.failedFaintAutorun);
        this.skipped = toDecorationType(iconPaths.skipped);
        this.duplicate = toDecorationType(iconPaths.duplicate);
        this.errored = toDecorationType(iconPaths.errored);
        this.erroredFaint = toDecorationType(iconPaths.erroredFaint);

        this.all = [
            this.pendingRequest,
            this.pendingTest,
            this.pendingFlow,
            this.pendingAutorun,
            this.scheduled,
            this.running,
            this.runningFailed,
            this.passed,
            this.failed,
            this.passedFaint,
            this.failedFaint,
            this.passedAutorun,
            this.failedAutorun,
            this.passedFaintAutorun,
            this.failedFaintAutorun,
            this.skipped,
            this.duplicate,
            this.errored,
            this.erroredFaint
        ];

        for (const decorationType of this.all) {
            context.subscriptions.push(decorationType);
        }
    }
}

function toDecorationType(iconPath: IconPath): vscode.TextEditorDecorationType {
    return vscode.window.createTextEditorDecorationType(toDecorationRenderOptions(iconPath));
}

function toDecorationRenderOptions(iconPath: IconPath): vscode.DecorationRenderOptions {
    if (typeof iconPath === 'string') {
        return { gutterIconPath: iconPath };
    } else {
        return {
            dark: { gutterIconPath: iconPath.dark },
            light: { gutterIconPath: iconPath.light }
        };
    }
}
