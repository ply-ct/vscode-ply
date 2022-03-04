import * as monaco from 'monaco-editor';
import { setDiagnosticsOptions } from 'monaco-yaml';
import * as time from './time';

let initialized = false;
export const initialize = () => {
    if (!initialized) {
        time.logtime('Monaco initialize()');
        initialized = true;
        setDiagnosticsOptions({
            enableSchemaRequest: false,
            hover: true,
            completion: true,
            validate: true,
            format: true
        });

        const baseUrl = import.meta.url.replace('/bundle.js', '/workers');
        (self as any).MonacoEnvironment = {
            getWorker: async function (moduleId: string, label: string) {
                time.logtime(`Monaco getWorker(${moduleId}, ${label})`);
                let url = `${baseUrl}/editor.worker.js`;
                if (label === 'json') {
                    url = `${baseUrl}/json.worker.js`;
                } else if (label === 'yaml') {
                    url = `${baseUrl}/yaml.worker.js`;
                }
                const blob = await (await fetch(url)).blob();
                return new Worker(URL.createObjectURL(blob));
            }
        };
    }
};

export const getEditor = (
    el: HTMLElement,
    value: string,
    language: string,
    readOnly: boolean,
    options: any
) => {
    const editor = monaco.editor.create(el, {
        value,
        language,
        theme: document.body.className.endsWith('vscode-dark') ? 'vs-dark' : 'vs',
        readOnly,
        folding: options.folding,
        lineNumbers: options.lineNumbers ? 'on' : 'off',
        lineDecorationsWidth: options.lineNumbers ? 10 : 0,
        lineNumbersMinChars: options.lineNumbers ? 2 : 0,
        renderLineHighlight: 'none',
        glyphMargin: false,
        tabSize: options.indent,
        insertSpaces: options.insertSpaces === false ? false : true,
        scrollbar: {
            verticalScrollbarSize: 12,
            horizontalSliderSize: 12
        },
        scrollBeyondLastLine: false,
        minimap: {
            enabled: false
        },
        hover: options.hovers
    });

    return editor;
};
