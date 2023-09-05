import { ValuesAccess, findExpressions, isRegex } from '@ply-ct/ply-values';
import { Decoration, HoverLine, HoverAction, TypedEvent, Listener, Disposable } from 'flowbee';
import { Values } from '../model/values';

export class Decorator {
    private valuesAccess: ValuesAccess;

    private _onHoverAction = new TypedEvent<HoverAction>();
    onHoverAction(listener: Listener<HoverAction>): Disposable {
        return this._onHoverAction.on(listener);
    }

    constructor(private values: Values) {
        this.valuesAccess = new ValuesAccess(values.valuesHolders, values.evalOptions);
    }

    decorate(text: string, options: { theme: 'light' | 'dark'; hover: boolean }): Decoration[] {
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        return lines.reduce((decs, line, i) => {
            for (const expr of findExpressions(line)) {
                // TODO refs and late-arriving values
                if (!isRegex(expr.text)) {
                    const locatedValue = this.valuesAccess.getValue(expr.text);
                    const hoverLines: HoverLine[] = [];

                    const override = this.values.overrides ? this.values.overrides[expr.text] : '';
                    const value = override || locatedValue?.value;

                    const dec: Decoration = {
                        range: { line: i, start: expr.start, end: expr.end },
                        className: value ? 'expression' : 'unresolved'
                    };
                    if (options.hover) {
                        if (value) {
                            hoverLines.push({ label: 'Value:', value: override || value });
                        }
                        const location = override ? '<Override>' : locatedValue?.location?.path;
                        if (location) {
                            hoverLines.push({
                                label: 'From:',
                                link: {
                                    label: location,
                                    action: {
                                        name: 'openFile',
                                        args: { path: location }
                                    },
                                    title: 'Open values file'
                                }
                            });
                        } else {
                            hoverLines.push({ label: 'Not found: ', value: expr.text });
                        }
                        dec.hover = {
                            theme: options.theme,
                            lines: hoverLines,
                            onAction: (action) => this._onHoverAction.emit(action)
                        };
                    }
                    decs.push(dec);
                }
            }
            return decs;
        }, [] as Decoration[]);
    }
}
