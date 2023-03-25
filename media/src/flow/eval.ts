/**
 * copied from ply
 */
export const safeEval = (input: string, context: any): string => {
    // directly contains expression (flat obj or user-entered values in vscode)
    const type = typeof context[input];
    if (type === 'string' || type === 'number' || type === 'boolean') {
        return context[input];
    }

    let res: any = context;
    for (const seg of tokenize(input, context)) {
        if (!res[seg]) return input;
        res = res[seg];
    }

    return '' + res;
};

const tokenize = (path: string, context: any): (string | number)[] => {
    return path.split(/\.(?![^[]*])/).reduce((segs: (string | number)[], seg) => {
        if (seg.search(/\[.+?]$/) > 0) {
            // indexer(s)
            const start = seg.indexOf('[');
            segs.push(seg.substring(0, start));
            let remains = seg.substring(start);
            while (remains.length > 0) {
                const indexer = remains.substring(1, remains.indexOf(']'));
                if (
                    (indexer.startsWith("'") && indexer.startsWith("'")) ||
                    (indexer.endsWith('"') && indexer.endsWith('"'))
                ) {
                    segs.push(indexer.substring(1, indexer.length - 1)); // object property
                } else {
                    let idx = parseInt(indexer);
                    if (isNaN(idx)) {
                        // indexer is expression
                        const val = safeEval(indexer, context);
                        idx = parseInt(val);
                        if (isNaN(idx)) {
                            segs.push(val);
                        } else {
                            segs.push(idx); // array index
                        }
                    } else {
                        segs.push(idx); // array index
                    }
                }
                remains = remains.substring(indexer.length + 2);
            }
        } else {
            segs.push(seg);
        }
        return segs;
    }, []);
};
