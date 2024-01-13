import * as monaco from 'monaco-editor';
import { setDiagnosticsOptions } from 'monaco-yaml';
import * as time from './time';

interface ValuesAccess {
    getValue(expression: string):
        | {
              value: string;
              location?: { path: string; line?: number };
          }
        | undefined;
}

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
                } else if (label === 'graphql') {
                    url = `${baseUrl}/graphql.worker.js`;
                }
                const blob = await (await fetch(url)).blob();
                return new Worker(URL.createObjectURL(blob));
            }
        };

        monaco.editor.onDidCreateModel((model) => {
            // compatibility https://github.com/microsoft/monaco-editor/blob/main/CHANGELOG.md#breaking-changes-3
            // (this is because monaco-yaml still expects this method)
            (model as any).getModeId = () => {
                return model.getLanguageId();
            };
        });
    }
};

export const getEditor = (
    el: HTMLElement,
    value: string,
    language: string,
    readOnly: boolean,
    options: any
): monaco.editor.IStandaloneCodeEditor => {
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
        hover: {
            ...(options.hovers || {}),
            enabled: expressionLanguages.includes(language) || options.hovers?.enabled || true
        }, // force hover enable for json, yaml
        fixedOverflowWidgets: true // hover position
    });

    return editor;
};

export interface Expression {
    text: string;
    range: monaco.Range;
    resolved?: boolean;
}

export const getDecorations = (
    expressions: Expression[]
): monaco.editor.IModelDeltaDecoration[] => {
    return expressions.map((expression) => ({
        range: expression.range,
        options: { inlineClassName: expression.resolved ? 'expression' : 'unresolved' }
    }));
};

export const getExpressions = (
    model?: monaco.editor.ITextModel | null,
    valuesAccess?: ValuesAccess | null
): Expression[] => {
    if (model && expressionLanguages.includes(model.getLanguageId())) {
        return model
            .findMatches('\\$\\{.+?\\}', true, true, true, null, true, undefined)
            .map((match) => {
                return {
                    text: match.matches ? match.matches[0] : '',
                    range: match.range,
                    resolved: !!(match.matches?.length && valuesAccess?.getValue(match.matches[0]))
                };
            });
    }
    return [];
};

export const expressionLanguages = ['json', 'yaml', 'xml', 'graphql'];
export const registeredHoverLanguages: string[] = [];

export const filterMarkers = (
    model: monaco.editor.ITextModel,
    markers: monaco.editor.IMarker[]
): monaco.editor.IMarker[] => {
    const expressionMarkers: monaco.editor.IMarker[] = [];

    let newMarkers = markers.filter((marker) => {
        if (isJsonMarker(marker) && marker.code === '516' && marker.startColumn > 1) {
            // Value expected
            const line = model.getLineContent(marker.startLineNumber);
            const seg = line.substring(marker.startColumn - 1).trim();
            if (seg.startsWith('${')) {
                const endCurly = seg.indexOf('}');
                if (endCurly > 2) {
                    const rest = seg.substring(endCurly + 1).trim();
                    if (!rest || rest === ',') {
                        expressionMarkers.push(marker);
                        return false; // i'll allow it
                    }
                }
            }
        }
        return true;
    });

    if (expressionMarkers.length) {
        newMarkers = newMarkers.filter((marker) => {
            if (isJsonMarker(marker)) {
                if (marker.code === '0' || marker.code === '514') {
                    // End of file expected, Expected comma
                    return false;
                }
            }
            return true;
        });
    }

    return newMarkers;
};

/**
 * Is json marker of interest
 */
const isJsonMarker = (marker: monaco.editor.IMarker): boolean => {
    return (
        marker.owner === 'json' &&
        marker.source === 'json' &&
        marker.startLineNumber === marker.endLineNumber &&
        marker.endColumn - marker.startColumn === 1
    );
};
