import { promises as fs, existsSync, Stats } from 'fs';
import { normalize } from 'path';
import { minimatch } from 'minimatch';
import { FileListOptions, FileList, FileAccess } from '@ply-ct/ply-api';

export class FileSystemAccess implements FileAccess {
    readonly base: string;
    constructor(base: string) {
        this.base = base.replace(/\\/g, '/');
        if (this.base.endsWith('/')) {
            this.base = this.base.substring(0, this.base.length - 1);
        }
    }

    async exists(relPath: string): Promise<boolean> {
        return existsSync(`${this.base}/${relPath}`);
    }

    async listFiles(relPath: string, options?: FileListOptions | undefined): Promise<string[]> {
        const dirPath = `${this.base}/${relPath}`;
        const filePaths: string[] = [];
        if (existsSync(dirPath)) {
            let items: string[];
            try {
                items = await fs.readdir(dirPath);
            } catch (err: any) {
                throw new Error(`Error reading dir: 'dirPath': ${err.message}`);
            }
            for (const item of items) {
                const path = `${relPath}/${item}`;
                let stats: Stats;
                try {
                    stats = await fs.stat(`${this.base}/${path}`);
                } catch (err: any) {
                    throw new Error(`Error getting file stats for '${path}': ${err.message}`);
                }
                if (stats.isFile()) {
                    if (!options?.patterns || this.isMatch(path, options.patterns)) {
                        filePaths.push(path);
                    }
                } else if (stats.isDirectory() && options?.recursive) {
                    filePaths.push(...(await this.listFiles(path, options)));
                }
            }
        }
        return filePaths;
    }

    async getFileList(relPath: string, options?: FileListOptions | undefined): Promise<FileList> {
        const fileList: FileList = {};
        const filePaths = await this.listFiles(relPath, options);
        for (const filePath of filePaths) {
            fileList[filePath] = await this.readFile(`${this.base}/${filePath}`);
        }
        return fileList;
    }

    async readTextFile(relPath: string): Promise<string | undefined> {
        const filePath = `${this.base}/${relPath}`;
        if (existsSync(filePath)) {
            return await fs.readFile(filePath, { encoding: 'utf-8' });
        }
    }

    /**
     * Match against glob patterns
     */
    isMatch(path: string, patterns: string[]): boolean {
        for (const pattern of patterns) {
            if (minimatch(normalize(path), pattern, { dot: true })) {
                return true;
            }
        }
        return false;
    }

    /**
     * Catches errors to provide a meaningful stack
     */
    async readFile(file: string): Promise<string> {
        try {
            return await fs.readFile(file, { encoding: 'utf-8' });
        } catch (err: any) {
            throw new Error(`Error reading file '${file}': ${err.message}`);
        }
    }
}
