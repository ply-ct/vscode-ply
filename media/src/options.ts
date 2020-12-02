import * as flowbee from 'flowbee/dist/nostyles';

export class Options {

    theme = 'light';
    grid = true;
    snap = true;
    zoom = 100;
    yaml = true;
    indent = 2;

    get iconBase() { return `${this.base}/icons/${this.theme}`; }

    constructor(readonly base: string, readonly webSocketUrl: string) {}

    get diagramOptions(): flowbee.DiagramOptions & flowbee.DrawingOptions {
        return {
            theme: this.theme,
            iconBase: `${this.iconBase}`,
            showGrid: this.grid,
            snapToGrid: this.snap,
            webSocketUrl: this.webSocketUrl,
            resizeWithContainer: true,
            promptToDelete: false // TODO prompt first time
        };
    }

    get toolboxOptions(): flowbee.ToolboxOptions {
        return {
            theme: this.theme,
            iconBase: `${this.iconBase}`
        };
    }

    get configuratorOptions(): flowbee.ConfiguratorOptions {
        return {
            theme: this.theme,
            sourceTab: 'yaml'
        };
    }
}