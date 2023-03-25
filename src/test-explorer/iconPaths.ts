import { ExtensionContext } from 'vscode';

export type IconPath = string | { dark: string; light: string };

export class IconPaths {
    pendingCategory: IconPath;
    pendingFolder: IconPath;
    pendingRequest: IconPath;
    pendingTest: IconPath;
    pendingFlow: IconPath;
    pendingStep: IconPath;
    pendingStart: IconPath;
    pendingStop: IconPath;
    pendingDecide: IconPath;
    pendingDelay: IconPath;
    pendingCase: IconPath;
    pendingMethod: IconPath;
    pendingAutorun: IconPath;
    scheduled: IconPath;
    running: IconPath;
    runningFailed: IconPath;
    passed: IconPath;
    failed: IconPath;
    passedFaint: IconPath;
    failedFaint: IconPath;
    passedAutorun: IconPath;
    failedAutorun: IconPath;
    passedFaintAutorun: IconPath;
    failedFaintAutorun: IconPath;
    skipped: IconPath;
    duplicate: IconPath;
    errored: IconPath;
    erroredFaint: IconPath;

    constructor(context: ExtensionContext) {
        this.pendingCategory = {
            dark: context.asAbsolutePath('icons/test-explorer/folders-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/folders-light.svg')
        };
        this.pendingFolder = {
            dark: context.asAbsolutePath('icons/test-explorer/folder-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/folder-light.svg')
        };
        this.pendingRequest = {
            dark: context.asAbsolutePath('icons/test-explorer/request-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/request-light.svg')
        };
        this.pendingTest = {
            dark: context.asAbsolutePath('icons/test-explorer/beaker-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/beaker-light.svg')
        };
        this.pendingFlow = {
            dark: context.asAbsolutePath('icons/test-explorer/flow-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/flow-light.svg')
        };
        this.pendingStep = {
            dark: context.asAbsolutePath('icons/test-explorer/flow/step-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/flow/step-light.svg')
        };
        this.pendingStart = {
            dark: context.asAbsolutePath('icons/test-explorer/flow/start-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/flow/start-light.svg')
        };
        this.pendingStop = {
            dark: context.asAbsolutePath('icons/test-explorer/flow/stop-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/flow/stop-light.svg')
        };
        this.pendingDecide = {
            dark: context.asAbsolutePath('icons/test-explorer/flow/decision-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/flow/decision-light.svg')
        };
        this.pendingDelay = {
            dark: context.asAbsolutePath('icons/test-explorer/flow/delay-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/flow/delay-light.svg')
        };
        this.pendingCase = {
            dark: context.asAbsolutePath('icons/test-explorer/typescript-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/typescript-light.svg')
        };
        this.pendingMethod = {
            dark: context.asAbsolutePath('icons/test-explorer/method-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/method-light.svg')
        };
        this.pendingAutorun = {
            dark: context.asAbsolutePath('icons/test-explorer/pending-autorun-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/pending-autorun-light.svg')
        };
        this.scheduled = context.asAbsolutePath('icons/test-explorer/scheduled.svg');
        this.running = context.asAbsolutePath('icons/test-explorer/running.svg');
        this.runningFailed = context.asAbsolutePath('icons/test-explorer/running-failed.svg');
        this.passed = context.asAbsolutePath('icons/test-explorer/passed.svg');
        this.failed = context.asAbsolutePath('icons/test-explorer/failed.svg');
        this.passedFaint = context.asAbsolutePath('icons/test-explorer/passed-faint.svg');
        this.failedFaint = context.asAbsolutePath('icons/test-explorer/failed-faint.svg');
        this.passedAutorun = {
            dark: context.asAbsolutePath('icons/test-explorer/passed-autorun-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/passed-autorun-light.svg')
        };
        this.failedAutorun = {
            dark: context.asAbsolutePath('icons/test-explorer/failed-autorun-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/failed-autorun-light.svg')
        };
        this.passedFaintAutorun = {
            dark: context.asAbsolutePath('icons/test-explorer/passed-faint-autorun-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/passed-faint-autorun-light.svg')
        };
        this.failedFaintAutorun = {
            dark: context.asAbsolutePath('icons/test-explorer/failed-faint-autorun-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/failed-faint-autorun-light.svg')
        };
        this.skipped = context.asAbsolutePath('icons/test-explorer/skipped.svg');
        this.duplicate = context.asAbsolutePath('icons/test-explorer/duplicate.svg');
        this.errored = context.asAbsolutePath('icons/test-explorer/errored.svg');
        this.erroredFaint = context.asAbsolutePath('icons/test-explorer/errored-faint.svg');
    }
}
