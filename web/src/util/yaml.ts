/**
 * Copied from @ply-ct/ply to avoid a dependency.
 */
import * as jsYaml from 'js-yaml';

export interface Yaml {
    start: number;
    text: string;
}

export function dump(obj: object, indent: number): string {
    return jsYaml.dump(obj, { noCompatMode: true, skipInvalid: true, indent, lineWidth: -1 });
}

export function load(file: string, contents: string, assignLines = false): any {
    const lines: any = {};
    const obj = jsYaml.load(contents, {
        filename: file,
        listener: function (op, state) {
            if (assignLines && op === 'open' && state.kind === 'scalar') {
                lines[state.result] = state.line;
            }
        }
    }) as any;
    if (obj && assignLines) {
        const contentLines = contents.split(/\r?\n/);
        let lastObjProp: any;
        Object.keys(obj).forEach((key) => {
            const line = lines[key];
            if (typeof line !== 'undefined' && typeof obj[key] === 'object') {
                if (!obj[key]) {
                    obj[key] = {};
                }
                const objProp = obj[key];
                objProp.__start = line;
                if (
                    lastObjProp &&
                    typeof lastObjProp.__start !== 'undefined' &&
                    typeof objProp.__start !== 'undefined'
                ) {
                    lastObjProp.__end = getEndLine(
                        contentLines,
                        lastObjProp.__start,
                        objProp.__start - 1
                    );
                }
                lastObjProp = objProp;
            }
        });
        if (lastObjProp && typeof lastObjProp.__start !== 'undefined') {
            lastObjProp.__end = getEndLine(contentLines, lastObjProp.__start);
        }
    }
    return obj;
}

function getEndLine(
    contentLines: string[],
    start: number,
    end: number | undefined = undefined
): number {
    const reversedLines = getLines(contentLines, start, end).reverse();
    let endLine = typeof end === 'undefined' ? start + reversedLines.length - 1 : end;
    for (let i = 0; i < reversedLines.length && endLine > start; i++) {
        const line = reversedLines[i].trim();
        if (!line || line.startsWith('#')) {
            endLine--;
        } else {
            break;
        }
    }
    return endLine;
}

/**
 * Returns content lines where index is between start and end - 1.
 * If end is not supplied, read to end of contentLines array.
 */
function getLines(contentLines: string[], start: number, end?: number): string[] {
    return contentLines.reduce((lines: string[], line: string, i: number) => {
        if (i >= start && (!end || i <= end)) {
            lines.push(line);
        }
        return lines;
    }, new Array<string>());
}
