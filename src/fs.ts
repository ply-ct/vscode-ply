import { existsSync } from 'fs';
import { workspace as ws, Uri, FileStat, FilePermission } from 'vscode';

export class Fs {
    readonly uri: Uri;

    /**
     * Actually file or directory.
     */
    get file(): string {
        return this.uri.fsPath;
    }

    constructor(file: string | Uri) {
        this.uri = typeof file === 'string' ? Uri.file(file) : file;
    }

    async stat(): Promise<FileStat> {
        return await ws.fs.stat(this.uri);
    }

    async exists(): Promise<boolean> {
        if (this.uri.scheme === 'file') {
            return existsSync(this.uri.fsPath);
        } else {
            try {
                this.stat();
                return true;
            } catch (err: unknown) {
                return false;
            }
        }
    }

    existsSync(): boolean {
        if (this.uri.scheme !== 'file') {
            throw new Error(`No existsSync() for: ${this.uri}`);
        }
        return existsSync(this.uri.fsPath);
    }

    async isReadonly(): Promise<boolean> {
        return (
            this.uri.scheme === 'git' ||
            (await ws.fs.stat(this.uri)).permissions === FilePermission.Readonly
        );
    }

    async readTextFile(): Promise<string> {
        const uintArr = await ws.fs.readFile(this.uri);
        return new TextDecoder().decode(uintArr);
    }

    async writeFile(content: string | Uint8Array) {
        if (typeof content === 'string') {
            ws.fs.writeFile(this.uri, new TextEncoder().encode(content));
        } else {
            ws.fs.writeFile(this.uri, content);
        }
    }

    async delete(options?: { recursive?: boolean; useTrash?: boolean }) {
        await ws.fs.delete(this.uri, options);
    }
}
