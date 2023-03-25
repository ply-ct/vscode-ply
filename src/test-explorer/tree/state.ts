import * as fs from 'fs';
import * as jsYaml from 'js-yaml';
import { Uri } from 'vscode';
import { TreeNode } from './treeNode';

export type CurrentNodeState =
    | 'pending'
    | 'scheduled'
    | 'running'
    | 'passed'
    | 'failed'
    | 'running-failed'
    | 'skipped'
    | 'always-skipped'
    | 'duplicate'
    | 'errored';

export type PreviousNodeState =
    | 'pending'
    | 'passed'
    | 'failed'
    | 'skipped'
    | 'always-skipped'
    | 'duplicate'
    | 'errored';

export interface NodeState {
    current: CurrentNodeState;
    previous: PreviousNodeState;
    autorun: boolean;
}

export function defaultState(skipped?: boolean, errored?: boolean): NodeState {
    return {
        current: errored ? 'errored' : skipped ? 'always-skipped' : 'pending',
        previous: errored ? 'errored' : skipped ? 'always-skipped' : 'pending',
        autorun: false
    };
}

export function parentNodeState(children: TreeNode[]): NodeState {
    return {
        current: parentCurrentNodeState(children),
        previous: parentPreviousNodeState(children),
        autorun: false
    };
}

export function parentCurrentNodeState(children: TreeNode[]): CurrentNodeState {
    if (children.length === 0) {
        return 'pending';
    } else if (children.every((child) => child.state.current.endsWith('skipped'))) {
        if (children.some((child) => child.state.current === 'skipped')) {
            return 'skipped';
        } else {
            return 'always-skipped';
        }
    } else if (children.some((child) => child.state.current === 'running')) {
        if (
            children.some(
                (child) =>
                    child.state.current.endsWith('failed') || child.state.current === 'errored'
            )
        ) {
            return 'running-failed';
        } else {
            return 'running';
        }
    } else if (children.some((child) => child.state.current === 'scheduled')) {
        if (
            children.some(
                (child) =>
                    child.state.current.endsWith('failed') || child.state.current === 'errored'
            )
        ) {
            return 'running-failed';
        } else if (children.some((child) => child.state.current === 'passed')) {
            return 'running';
        } else {
            return 'scheduled';
        }
    } else if (children.some((child) => child.state.current === 'running-failed')) {
        return 'running-failed';
    } else if (children.some((child) => child.state.current === 'errored')) {
        return 'errored';
    } else if (children.some((child) => child.state.current === 'failed')) {
        return 'failed';
    } else if (children.some((child) => child.state.current === 'passed')) {
        return 'passed';
    } else {
        return 'pending';
    }
}

export function parentPreviousNodeState(children: TreeNode[]): PreviousNodeState {
    if (children.length === 0) {
        return 'pending';
    } else if (children.every((child) => child.state.previous.endsWith('skipped'))) {
        if (children.some((child) => child.state.previous === 'skipped')) {
            return 'skipped';
        } else {
            return 'always-skipped';
        }
    } else if (children.some((child) => child.state.previous === 'errored')) {
        return 'errored';
    } else if (children.some((child) => child.state.previous === 'failed')) {
        return 'failed';
    } else if (children.some((child) => child.state.previous === 'passed')) {
        return 'passed';
    } else {
        return 'pending';
    }
}

export function parentAutorunFlag(children: TreeNode[]): boolean {
    return children.some((child) => child.state.autorun);
}

export type StateIconType =
    | 'pendingCategory'
    | 'pendingFolder'
    | 'pendingRequest'
    | 'pendingTest'
    | 'pendingFlow'
    | 'pendingStep'
    | 'pendingStart'
    | 'pendingStop'
    | 'pendingDecide'
    | 'pendingDelay'
    | 'pendingCase'
    | 'pendingMethod'
    | 'pendingAutorun'
    | 'scheduled'
    | 'running'
    | 'runningFailed'
    | 'passed'
    | 'passedAutorun'
    | 'failed'
    | 'failedAutorun'
    | 'skipped'
    | 'passedFaint'
    | 'passedFaintAutorun'
    | 'failedFaint'
    | 'failedFaintAutorun'
    | 'duplicate'
    | 'errored'
    | 'erroredFaint';

export function stateIcon(state: NodeState, testId: string): StateIconType {
    switch (state.current) {
        case 'scheduled':
            return 'scheduled';

        case 'running':
            return 'running';

        case 'running-failed':
            return 'runningFailed';

        case 'passed':
            return state.autorun ? 'passedAutorun' : 'passed';

        case 'failed':
            return state.autorun ? 'failedAutorun' : 'failed';

        case 'skipped':
        case 'always-skipped':
            return 'skipped';

        case 'duplicate':
            return 'duplicate';

        case 'errored':
            return 'errored';

        default:
            switch (state.previous) {
                case 'passed':
                    return state.autorun ? 'passedFaintAutorun' : 'passedFaint';

                case 'failed':
                    return state.autorun ? 'failedFaintAutorun' : 'failedFaint';

                case 'skipped':
                case 'always-skipped':
                    return 'skipped';

                case 'duplicate':
                    return 'duplicate';

                case 'errored':
                    return 'erroredFaint';

                default: {
                    if (state.autorun) {
                        return 'pendingAutorun';
                    } else {
                        const uri = toUri(testId);
                        const path = uri.path;
                        if (path === '/requests' || path === '/flows' || path === '/cases') {
                            return 'pendingCategory';
                        }
                        if (path.endsWith('.ply')) {
                            return 'pendingRequest';
                        } else if (path.endsWith('.flow')) {
                            if (uri.fragment) {
                                // rough parse flow file for step type
                                const stepId = uri.fragment;
                                const yaml = fs.readFileSync(uri.fsPath, { encoding: 'utf-8' });
                                const flow = jsYaml.load(yaml, { filename: uri.fsPath }) as any;
                                let step = flow.steps.find((s: any) => s.id === stepId);
                                if (!step && flow.subflows) {
                                    for (let i = 0; i < flow.subflows.length; i++) {
                                        step = flow.subflows[i].steps?.find(
                                            (s: any) => s.id === stepId
                                        );
                                        if (step) break;
                                    }
                                }
                                if (step?.path === 'start') {
                                    return 'pendingStart';
                                } else if (step?.path === 'stop') {
                                    return 'pendingStop';
                                } else if (step?.path === 'decide') {
                                    return 'pendingDecide';
                                } else if (step?.path === 'delay') {
                                    return 'pendingDelay';
                                } else if (step?.path === 'request') {
                                    return 'pendingRequest';
                                } else if (step?.path === 'typescript') {
                                    return 'pendingCase';
                                } else {
                                    return 'pendingStep';
                                }
                            } else {
                                return 'pendingFlow';
                            }
                        } else if (path.endsWith('.yaml')) {
                            if (uri.fragment) {
                                return 'pendingRequest';
                            } else {
                                return 'pendingTest';
                            }
                        } else if (path.endsWith('.ts')) {
                            if (uri.fragment) {
                                return 'pendingMethod';
                            } else {
                                return 'pendingCase';
                            }
                        } else {
                            return 'pendingFolder';
                        }
                    }
                }
            }
    }
}

export function toUri(testId: string): Uri {
    const pipe = testId.indexOf('|');
    if (pipe > 0) {
        // ply root designator
        testId = testId.substring(pipe + 1);
    }
    return Uri.parse(testId);
}
