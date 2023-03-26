import { Decorator, Decoration, HoverLine, findExpressions } from 'flowbee';
import { values } from './values';

export const decorator: Decorator = (text: string): Decoration[] => {
    const lines = text.split(/\r?\n/);
    return lines.reduce((decs, line, i) => {
        for (const expr of findExpressions(line)) {
            // TODO refs and late-arriving values
            if (!expr.text.startsWith('${~') && !expr.text.startsWith('${@')) {
                const location = values.access.getLocation(expr.text, values.trusted);
                const value = values.access.evaluate(expr.text, values.trusted);
                const hoverLines: HoverLine[] = [];
                if (location && value) {
                    let loc = location.path.replace(/\\/g, '/');
                    const lastSlash = loc.lastIndexOf('/');
                    if (lastSlash >= 0 && lastSlash < loc.length - 1) {
                        loc = loc.substring(lastSlash + 1);
                    }
                    hoverLines.push({ label: 'Value:', value });
                    hoverLines.push({
                        label: 'From:',
                        link: { label: loc, action: 'open values file' }
                    });
                } else {
                    hoverLines.push({ label: 'Not found: ', value: expr.text });
                }

                decs.push({
                    range: { line: i, start: expr.start, end: expr.end },
                    className: 'expression',
                    hover: {
                        lines: hoverLines
                    }
                });
            }
        }
        return decs;
    }, [] as Decoration[]);
};
