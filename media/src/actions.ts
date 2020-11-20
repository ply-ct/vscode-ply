import * as flowbee from 'flowbee/dist/nostyles';

export interface OptionToggleEvent {
    option: string;
}
export interface FlowActionEvent {
    action: string;
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
            this._onOptionToggle.emit({ option: (e.target as HTMLElement).id });
        };
        // snap
        const snapToggle = container.querySelector('#snap') as HTMLInputElement;
        snapToggle.onclick = e => {
            this._onOptionToggle.emit({ option: (e.target as HTMLElement).id });
        };
        // zoom
        const zoomSlider = container.querySelector('#zoom-range') as HTMLInputElement;
        zoomSlider.oninput = e => {
            this._onZoomChange.emit({ zoom: parseInt((e.target as HTMLInputElement).value) });
        };
        const zoomOut = container.querySelector('#zoom-out') as HTMLInputElement;
        zoomOut.onclick = _e => {
            const zoom = Math.max(parseInt(zoomSlider.value) - 20, 20);
            zoomSlider.value = '' + zoom;
            this._onZoomChange.emit({ zoom });
        };
        const zoomIn = container.querySelector('#zoom-in') as HTMLInputElement;
        zoomIn.onclick = _e => {
            const zoom = Math.min(parseInt(zoomSlider.value) + 20, 200);
            zoomSlider.value = '' + zoom;
            this._onZoomChange.emit({ zoom });
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
        // mode
        const modeToggle = container.querySelector('#mode-toggle') as HTMLSpanElement;
        modeToggle.onclick = _e => {
            this._onOptionToggle.emit({ option: 'mode' });
        };
    }
}

export class FlowActions {

    private _onFlowAction = new flowbee.TypedEvent<FlowActionEvent>();
    onFlowAction(listener: flowbee.Listener<FlowActionEvent>) {
        this._onFlowAction.on(listener);
    }

    private run: HTMLInputElement;
    private debug: HTMLInputElement;

    constructor(container: HTMLElement) {
        const actionClick = (e: MouseEvent) => {
            this._onFlowAction.emit({ action: (e.target as HTMLElement).id });
        };

        this.run = container.querySelector('#run') as HTMLInputElement;
        this.run.onclick = actionClick;
        this.debug = container.querySelector('#debug') as HTMLInputElement;
        this.debug.onclick = actionClick;
    }

    enable(isEnabled: boolean) {
        this.run.disabled = !isEnabled;
        this.debug.disabled = !isEnabled;
    }

}