import * as flowbee from 'flowbee/dist/nostyles';

export interface OptionToggleEvent {
    option: string;
}
export interface FlowActionEvent {
    action: string;
    target?: any;
    options?: any;
}
export interface ZoomChangeEvent {
    zoom: number;
}

export class DrawingTools {

    private _onOptionToggle = new flowbee.TypedEvent<OptionToggleEvent>();
    onOptionToggle(listener: flowbee.Listener<OptionToggleEvent>) {
        this._onOptionToggle.on(listener);
    }

    private _onZoomChange = new flowbee.TypedEvent<ZoomChangeEvent>();
    onZoomChange(listener: flowbee.Listener<ZoomChangeEvent>) {
        this._onZoomChange.on(listener);
    }

    constructor(container: HTMLElement) {
        // grid
        const gridToggle = container.querySelector('#grid') as HTMLInputElement;
        gridToggle.onclick = e => {
            gridToggle.classList.toggle('unselected');
            this._onOptionToggle.emit({ option: (e.target as HTMLElement).id });
        };
        // snap
        const snapToggle = container.querySelector('#snap') as HTMLInputElement;
        snapToggle.onclick = e => {
            snapToggle.classList.toggle('unselected');
            this._onOptionToggle.emit({ option: (e.target as HTMLElement).id });
        };
        // zoom
        const zoomSlider = container.querySelector('#zoom-range') as HTMLInputElement;
        zoomSlider.oninput = e => {
            const zoom = parseInt((e.target as HTMLInputElement).value);
            this._onZoomChange.emit({ zoom });
            zoomSlider.title = `${zoom} %`;
        };
        const zoomOut = container.querySelector('#zoom-out') as HTMLInputElement;
        zoomOut.onclick = _e => {
            const zoom = Math.max(parseInt(zoomSlider.value) - 20, 20);
            zoomSlider.value = '' + zoom;
            this._onZoomChange.emit({ zoom });
            zoomSlider.title = `${zoom} %`;
        };
        const zoomIn = container.querySelector('#zoom-in') as HTMLInputElement;
        zoomIn.onclick = _e => {
            const zoom = Math.min(parseInt(zoomSlider.value) + 20, 200);
            zoomSlider.value = '' + zoom;
            this._onZoomChange.emit({ zoom });
            zoomSlider.title = `${zoom} %`;
        };
        // pinch gesture
        window.addEventListener('wheel', e => {
            if (e.ctrlKey && document.activeElement === document.getElementById('diagram-canvas')) {
                e.preventDefault();
                let zoom = parseInt(zoomSlider.value) - e.deltaY;
                if (zoom < 20) {
                    zoom = 20;
                }
                else if (zoom > 200) {
                    zoom = 200;
                }
                zoomSlider.value = '' + zoom;
                this._onZoomChange.emit({ zoom });
            }
        }, { passive: false });
        // mode select
        const modeSelect = container.querySelector('#mode-select') as HTMLInputElement;
        const modeDrop = container.querySelector('#mode-drop') as HTMLElement;
        modeSelect.onmouseover = () => modeDrop.style.opacity = '1';
        modeSelect.onmouseout = () => modeDrop.style.opacity = '0.5';
        const modeMenu = container.querySelector('#mode-menu') as HTMLUListElement;
        modeSelect.onclick = () => {
            if (modeMenu.classList.contains('hidden')) {
                modeMenu.classList.remove('hidden');
                modeMenu.focus();
            }
        };
        modeMenu.onblur = () => {
            if (!modeMenu.classList.contains('hidden')) {
                modeMenu.classList.add('hidden');
            }
        };
        for (const modeOption of modeMenu.querySelectorAll('li')) {
            modeOption.onclick = () => {
                const mode = modeOption.id.substring(0, modeOption.id.length - 5);
                this.switchMode(mode as flowbee.Mode);
                if (!modeMenu.classList.contains('hidden')) {
                    modeMenu.classList.add('hidden');
                }
                this._onOptionToggle.emit({ option: mode });
            };
        }
    }

    switchMode(mode: flowbee.Mode) {
        (document.getElementById('mode-select') as HTMLElement).querySelectorAll('input').forEach(input => {
            if (input.id === mode) {
                if (input.style.display === 'none') {
                    input.style.display = 'inline-block';
                }
            } else if (input.style.display !== 'none') {
                input.style.display = 'none';
            }
        });
    }
}

export class FlowActions {

    private _onFlowAction = new flowbee.TypedEvent<FlowActionEvent>();
    onFlowAction(listener: flowbee.Listener<FlowActionEvent>) {
        this._onFlowAction.on(listener);
    }

    private values: HTMLInputElement;
    private submit: HTMLInputElement;
    private run: HTMLInputElement;
    private debug: HTMLInputElement;
    private expected: HTMLInputElement;
    private compare: HTMLInputElement;

    constructor(readonly iconBase: string, container: HTMLElement) {
        const actionClick = (e: MouseEvent) => {
            let action = (e.target as HTMLElement).id;
            if (action === 'run' && this.run.getAttribute('src') === `${this.iconBase}/stop.svg`) {
                action = 'stop';
            }
            this._onFlowAction.emit({ action });
        };

        this.values = container.querySelector('#values') as HTMLInputElement;
        this.values.onclick = actionClick;
        this.submit = container.querySelector('#submit') as HTMLInputElement;
        this.submit.onclick = actionClick;
        this.run = container.querySelector('#run') as HTMLInputElement;
        this.run.onclick = actionClick;
        this.debug = container.querySelector('#debug') as HTMLInputElement;
        this.debug.onclick = actionClick;
        this.expected = container.querySelector('#expected') as HTMLInputElement;
        this.expected.onclick = actionClick;
        this.compare = container.querySelector('#compare') as HTMLInputElement;
        this.compare.onclick = actionClick;
    }

    enableCompare(isEnabled: boolean) {
        this.compare.disabled = !isEnabled;
    }

    setRunning(running: boolean) {
        const base = running ? 'stop' : 'run';
        this.run.setAttribute('src', `${this.iconBase}/${base}.svg`);
        this.run.setAttribute('alt', base);
        this.run.setAttribute('title', `${base.charAt(0).toUpperCase()}${base.substring(1)}`);
    }
}