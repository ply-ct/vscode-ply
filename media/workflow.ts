import * as flowbee from 'flowbee';

export class Workflow {

    options: flowbee.DrawingOptions;

    constructor(base: string, readonly specs: flowbee.Specifier[]) {
        this.options = document.body.className.endsWith('vscode-light') ? flowbee.LIGHT_OPTIONS : flowbee.DARK_OPTIONS;
        this.options.iconBase = `${base}/icons`;
        this.options.specIdPrefix = 'ply';
    }

    render(text: string, file: string, readonly = false) {
        const canvas = document.getElementById('workflow-canvas') as HTMLCanvasElement;
        console.info(`rendering workflow ${file} to canvas: ${canvas}`);
        const flow = new flowbee.FlowDiagram(canvas, this.options, this.specs, readonly);

        const instance = undefined;
        const step: string | undefined = undefined;
        const animate = false;
        const instanceEdit = false;
        const data = undefined;

        flow.render(text, file, instance, step, animate, instanceEdit, data);
    }
}

// @ts-ignore
const vscode = acquireVsCodeApi();

window.addEventListener('message', async (event) => {
    const message = event.data; // json message data from extension
    console.debug(`message: ${JSON.stringify(message, null, 2)}`);
    if (message.type === 'update') {
        const workflow = new Workflow(message.base, message.specs);
        workflow.render(message.text, message.file);
        // save state
        const { base, specs, file, text } = message;
        vscode.setState({ base, specs, file, text });
    }
});

const state = vscode.getState();
if (state) {
    const workflow = new Workflow(state.base, state.specs);
    workflow.render(state.text, state.file);
}

