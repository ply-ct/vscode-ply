import * as vscode from 'vscode';
import * as ply from 'ply-ct';

export class DiffState {

    constructor(
        private readonly workspaceFolder: vscode.WorkspaceFolder,
        private readonly workspaceState: vscode.Memento
    ) {}

    get state(): any {
        return this.workspaceState.get(`ply-diffs:${this.workspaceFolder.uri}`) || {} as any;
    }

    set state(value: any) {
        this.workspaceState.update(`ply-diffs:${this.workspaceFolder.uri}`, value);
    }

    getDiffs(testId: string): ply.Diff[] {
        return this.state[testId] || [];
    }

    updateDiffs(testId: string, diffs: ply.Diff[]) {
        this.state = { [testId]: diffs, ...this.state };
    }

    clearDiffs(testId: string): void;
    clearDiffs(testIds: string[]): void;
    clearDiffs(testIds: string | string[]) {
        const ids = typeof testIds === 'string' ? [testIds] : testIds;
        const diffState = this.state;
        ids.forEach(id => delete diffState[id]);
        this.state = diffState;
    }

    clearState() {
        this.state = undefined;
    }
}

export class ResultDiff {



}