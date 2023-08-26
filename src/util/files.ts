import { EOL } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as mime from 'mime-types';
import { Fs } from '../fs';

/**
 * split a string into an array of lines, ignoring escaped
 */
export const lines = (input: string): string[] => {
    return input.split(/\r?\n/);
};

/**
 * substitute a forward slash for all backslashes
 */
export const forwardSlashes = (path: string): string => {
    return path.replace(/\\/g, '/');
};

/**
 * remove windows newline characters (\r)
 */
export const fixEols = (path: string): string => {
    return path.replace(/\r/g, '');
};

export const filtersFromContentType = (contentType: string): { [name: string]: string[] } => {
    const filters: { [name: string]: string[] } = {};
    const ext = mime.extension(contentType);
    if (ext) filters[contentType] = [ext];
    return filters;
};

export interface CreateFileOptions {
    /**
     * relative to workspace folder
     */
    dirpath: string;
    /**
     * in dirpath
     */
    filename?: string;
    filters?: { [name: string]: string[] };
    /**
     * relative to templatePath
     */
    template: string;
    substs?: { [subst: string]: string };
    doOpen?: boolean;
}

export class WorkspaceFiles {
    readonly workspaceFolder: vscode.WorkspaceFolder;

    constructor(readonly resourceUri: vscode.Uri, readonly templatePath: string) {
        this.workspaceFolder = this.getWorkspaceFolder(resourceUri);
    }

    private getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(
                uri.with({ scheme: 'file', fragment: '' })
            );
            if (!workspaceFolder) {
                throw new Error(`Workspace folder not found for flow path: ${uri}`);
            }
            return workspaceFolder;
        } catch (err: unknown) {
            console.error(err);
            vscode.window.showErrorMessage(`${err}`);
            throw err;
        }
    }

    /**
     * Returns path of created file (if valid and not canceled)
     */
    async createFile(options: CreateFileOptions): Promise<string | undefined> {
        let dir = this.workspaceFolder.uri;
        const fs = new Fs(path.join(this.workspaceFolder.uri.fsPath, options.dirpath));
        if (await fs.exists()) {
            dir = dir.with({ path: `${dir.path}/${options.dirpath}` });
        }

        let fileUri: vscode.Uri | undefined; // relative to workspace folder
        if (options.filename) {
            fileUri = dir.with({ path: `${dir.path}/${options.filename}` });
        } else {
            fileUri = await vscode.window.showSaveDialog({
                defaultUri: dir,
                filters: options.filters
            });
        }
        if (fileUri) {
            const filepath = this.pathInWorkspaceFolder(this.workspaceFolder, fileUri);
            if (filepath) {
                const templateFs = new Fs(path.join(this.templatePath, options.template));
                let contents: string | undefined;
                if (await templateFs.exists()) {
                    contents = await templateFs.readTextFile();
                } else if (options.template === 'blank.json') {
                    contents = ['{', '}'].join(EOL);
                }
                if (!contents) {
                    vscode.window.showErrorMessage(`Ply template not found: ${templateFs.file}`);
                    return;
                }
                if (options.substs) {
                    for (const subst of Object.keys(options.substs)) {
                        contents = contents.replace(subst, options.substs[subst]);
                    }
                }
                await new Fs(path.join(this.workspaceFolder.uri.fsPath, filepath)).writeFile(
                    contents
                );
                if (options.doOpen) {
                    await vscode.commands.executeCommand('vscode.open', fileUri);
                }
                return filepath;
            }
        }
    }

    /**
     * Returns undefined if not in workspace folder
     */
    pathInWorkspaceFolder(
        workspaceFolder: vscode.WorkspaceFolder,
        fileUri: vscode.Uri
    ): string | undefined {
        const resourceWsFolder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (resourceWsFolder?.name === workspaceFolder.name) {
            return vscode.workspace.asRelativePath(fileUri, false);
        } else {
            vscode.window.showErrorMessage(
                `File must be under workspace folder ${workspaceFolder.name}`
            );
        }
    }
}
