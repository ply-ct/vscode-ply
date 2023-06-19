import { Values as ValuesAccess, findExpressions, isRegex } from '@ply-ct/ply-values';
import { Decoration, HoverLine, HoverAction, TypedEvent, Listener, Disposable } from 'flowbee';
import { Values } from '../model/values';

export class Decorator {
    private valuesAccess: ValuesAccess;

    private _onHoverAction = new TypedEvent<HoverAction>();
    onHoverAction(listener: Listener<HoverAction>): Disposable {
        return this._onHoverAction.on(listener);
    }

    constructor(values: Values) {
        this.valuesAccess = new ValuesAccess(values.valuesHolders, values.evalOptions);
    }

    decorate(text: string, theme: 'light' | 'dark'): Decoration[] {
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        return lines.reduce((decs, line, i) => {
            for (const expr of findExpressions(line)) {
                // TODO refs and late-arriving values
                if (!isRegex(expr.text)) {
                    const locatedValue = this.valuesAccess.getValue(expr.text);
                    const hoverLines: HoverLine[] = [];

                    if (locatedValue) {
                        hoverLines.push({ label: 'Value:', value: locatedValue.value });
                    }
                    if (locatedValue?.location) {
                        hoverLines.push({
                            label: 'From:',
                            link: {
                                label: locatedValue.location.path,
                                action: {
                                    name: 'openFile',
                                    args: { path: locatedValue.location.path }
                                },
                                title: 'Open values file'
                            }
                        });
                    } else {
                        hoverLines.push({ label: 'Not found: ', value: expr.text });
                    }

                    decs.push({
                        range: { line: i, start: expr.start, end: expr.end },
                        className: 'expression',
                        hover: {
                            theme,
                            lines: hoverLines,
                            onAction: (action) => this._onHoverAction.emit(action)
                        }
                    });
                }
            }
            return decs;
        }, [] as Decoration[]);
    }
}
