import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as ply from '@ply-ct/ply';
import { TypedEvent, Listener } from 'flowbee';
import { Descriptor } from 'flowbee';
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
            .get(Setting.customSteps, '');
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
        const fsPath = uri.fsPath;
        if (fs.existsSync(fsPath)) {
            const obj = JSON.parse(await fs.promises.readFile(fsPath, 'utf-8'));
            if (obj.path && obj.name && obj.type === 'step') {
                if (obj.icon && !obj.icon.startsWith('<svg')) {
                    // inline
                    const iconFile = path.join(this.workspaceFolder.uri.fsPath, obj.icon);
                    if (fs.existsSync(iconFile)) {
                        obj.icon = await fs.promises.readFile(iconFile, 'utf-8');
                    }
                }
                if (obj.template) {
                    if (typeof obj.template === 'string') {
                        const templateFile = path.join(path.resolve(fsPath, '..'), obj.template);
                        if (fs.existsSync(templateFile)) {
                            const yml = await fs.promises.readFile(templateFile, 'utf-8');
                            obj.template = ply.loadYaml(templateFile, yml);
                        } else {
                            this.log.error(`Error: Template not found: ${templateFile}`);
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
                this.log.error(`Error: Invalid descriptor: ${fsPath}`);
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
