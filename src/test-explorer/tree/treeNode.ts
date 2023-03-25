import * as vscode from 'vscode';
import { NodeState } from './state';
import { TestCollection } from './testCollection';
import { TestSuiteNode } from './testSuiteNode';
import { TestSuiteInfo, TestInfo } from '../../test-adapter/api/index';

export interface TreeNode {
    readonly info: TestSuiteInfo | TestInfo;
    readonly file: string | undefined;
    readonly line: number | undefined;
    readonly fileUri: string | undefined;
    uniqueId: string;
    readonly adapterIds: string[];
    readonly state: NodeState;
    sendStateNeeded: boolean;
    readonly log: string | undefined;
    readonly collection: TestCollection;
    readonly parent: TestSuiteNode | undefined;
    readonly children: TreeNode[];
    retireState(): void;
    resetState(): void;
    setAutorun(autorun: boolean): void;
    getTreeItem(): vscode.TreeItem;
    getFullLabel(): string;
}
