import { ExtensionContext, ThemeColor, ThemeIcon } from 'vscode';
import { StateIconType } from './tree/state';

export type IconPath = string | { dark: string; light: string; themeIcon?: ThemeIcon };

export class IconPaths {
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
        this.scheduled = {
            dark: context.asAbsolutePath('icons/test-explorer/scheduled.svg'),
            light: context.asAbsolutePath('icons/test-explorer/scheduled.svg'),
            themeIcon: new ThemeIcon('watch')
        };
        this.running = {
            dark: context.asAbsolutePath('icons/test-explorer/running-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/running-light.svg'),
            themeIcon: new ThemeIcon('loading~spin')
        };
        this.runningFailed = context.asAbsolutePath('icons/test-explorer/running-failed.svg');
        this.passed = this.passedFaint = {
            dark: context.asAbsolutePath('icons/test-explorer/passed-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/passed-light.svg'),
            themeIcon: new ThemeIcon('pass', new ThemeColor('testing.iconPassed'))
        };
        this.failed = this.failedFaint = {
            dark: context.asAbsolutePath('icons/test-explorer/failed-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/failed-light.svg'),
            themeIcon: new ThemeIcon('error', new ThemeColor('testing.iconFailed'))
        };
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
        this.errored = this.erroredFaint = {
            dark: context.asAbsolutePath('icons/test-explorer/errored-dark.svg'),
            light: context.asAbsolutePath('icons/test-explorer/errored-light.svg'),
            themeIcon: new ThemeIcon('error', new ThemeColor('testing.iconErrored'))
        };
    }

    get(key: StateIconType): IconPath | ThemeIcon {
        const iconPath: IconPath = this[key];
        return (iconPath as { themeIcon: ThemeIcon }).themeIcon || iconPath;
    }
}
