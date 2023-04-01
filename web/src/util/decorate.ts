import { Decoration, HoverLine, findExpressions, ValuesAccess } from 'flowbee';
import { Values } from '../model/values';

export class Decorator {
    private valuesAccess: ValuesAccess;
    private trusted: boolean;

    constructor(values: Values) {
        this.valuesAccess = new ValuesAccess(values.objects, values.env);
        this.trusted = values.trusted || false;
    }

    decorate(text: string): Decoration[] {
        const lines = text.split(/\r?\n/);
        return lines.reduce((decs, line, i) => {
            for (const expr of findExpressions(line)) {
                // TODO refs and late-arriving values
                if (!expr.text.startsWith('${~') && !expr.text.startsWith('${@')) {
                    const location = this.valuesAccess.getLocation(expr.text, this.trusted);
                    const value = this.valuesAccess.evaluate(expr.text, this.trusted);
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
    }
}
