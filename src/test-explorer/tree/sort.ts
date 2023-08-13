import { TreeNode } from './treeNode';

export function getCompareFn(): ((a: TreeNode, b: TreeNode) => number) | undefined {
    return compareLocation;
}

function compareLabel(a: TreeNode, b: TreeNode): number {
    return a.info.label.localeCompare(b.info.label);
}

function compareLocation(a: TreeNode, b: TreeNode): number {
    if (a.fileUri) {
        if (b.fileUri) {
            const compared = a.fileUri.localeCompare(b.fileUri);
            if (compared !== 0) {
                return compared;
            }
        } else {
            return -1;
        }
    } else if (b.fileUri) {
        return 1;
    }

    if (a.line !== undefined) {
        //TODO is line === 0 possible?
        if (b.line !== undefined) {
            const compared = a.line - b.line;
            if (compared !== 0) {
                return compared;
            }
        } else {
            return -1;
        }
    } else if (b.line !== undefined) {
        return 1;
    }

    return compareLabel(a, b);
}
