import * as path from 'path';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { TypedEvent, Listener, Descriptor } from '@ply-ct/ply-api';
import { Fs } from '../fs';
import { Setting } from '../config';

export interface DescriptorsChangeEvent {
    workspaceFolder: vscode.WorkspaceFolder;
}

export class Custom {
    private descriptors?: Descriptor[];
    private _onDescriptorsChange = new TypedEvent<DescriptorsChangeEvent>();
    onDescriptorsChange = (listener: Listener<DescriptorsChangeEvent>): { dispose(): void } => {
        return this._onDescriptorsChange.on(listener);
    };

    private disposables: { dispose(): void }[] = [];

    constructor(
        readonly resourceUri: vscode.Uri,
        readonly workspaceFolder: vscode.WorkspaceFolder,
        readonly log: ply.Log
    ) {}

    getCustomStepsPattern(): string | undefined {
        const setting = vscode.workspace
            .getConfiguration('ply', this.resourceUri)
            .get(Setting.customSteps, 'steps/**/*.json');
        if (setting) return setting;
    }

    getDescriptorPattern(): vscode.RelativePattern | undefined {
        const pattern = this.getCustomStepsPattern();
        if (pattern) {
            return new vscode.RelativePattern(this.workspaceFolder.uri, pattern);
        }
    }

    async getDescriptors(): Promise<Descriptor[]> {
        if (!this.descriptors) {
            this.dispose();
            const descriptorPattern = this.getDescriptorPattern();
            if (descriptorPattern) {
                this.descriptors = [];
                for (const uri of await vscode.workspace.findFiles(descriptorPattern)) {
                    const descriptor = await this.loadDescriptor(uri);
                    if (descriptor) {
                        this.descriptors.push(descriptor);
                    }
                }
            }
            this.registerWatchers(descriptorPattern);
        }
        return this.descriptors || [];
    }

    private async loadDescriptor(uri: vscode.Uri): Promise<Descriptor | undefined> {
        const fs = new Fs(uri);
        if (await fs.exists()) {
            const obj = JSON.parse(await fs.readTextFile());
            if (obj.path && obj.name && obj.type === 'step') {
                if (obj.icon && !obj.icon.startsWith('<svg')) {
                    // inline
                    const iconFs = new Fs(path.join(this.workspaceFolder.uri.fsPath, obj.icon));
                    if (await iconFs.exists()) {
                        obj.icon = await iconFs.readTextFile();
                    }
                }
                if (obj.template) {
                    if (typeof obj.template === 'string') {
                        const templateFs = new Fs(
                            path.join(path.resolve(fs.file, '..'), obj.template)
                        );
                        if (await templateFs.exists()) {
                            const yml = await templateFs.readTextFile();
                            obj.template = ply.loadYaml(templateFs.file, yml);
                        } else {
                            this.log.error(`Error: Template not found: ${templateFs.file}`);
                            delete obj.template;
                        }
                    } else {
                        if (typeof obj.template !== 'object') {
                            this.log.error(`Error: Bad template property: ${obj.name}`);
                            delete obj.template;
                        }
                    }
                }
                return obj as Descriptor;
            } else {
                this.log.error(`Error: Invalid descriptor: ${fs.file}`);
            }
        }
    }

    registerWatchers(descriptorPattern?: vscode.RelativePattern) {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((change) => {
                if (change.affectsConfiguration('scorch.snapiConfigLoc', this.resourceUri)) {
                    this.onChange();
                }
            })
        );

        if (descriptorPattern) {
            const watcher = vscode.workspace.createFileSystemWatcher(descriptorPattern);
            this.disposables.push(watcher);
            watcher.onDidChange(() => this.onChange());
            watcher.onDidCreate(() => this.onChange());
            watcher.onDidDelete(() => this.onChange());
        }
    }

    private onChange() {
        this.descriptors = undefined;
        this._onDescriptorsChange.emit({ workspaceFolder: this.workspaceFolder });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
    }
}
