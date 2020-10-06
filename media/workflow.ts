import * as flowbee from 'flowbee';

export class Workflow {

  options: flowbee.DrawingOptions;

  constructor(base: string, readonly specs: flowbee.Specifier[]) {
    this.options = document.body.className === 'vscode-light' ? flowbee.LIGHT_OPTIONS : flowbee.DARK_OPTIONS;
    this.options.iconBase = `${base}/icons`;
  }

  render(text: string, file: string, animate = false) {
    const canvas = document.getElementById('workflow-canvas') as HTMLCanvasElement;
    const flow = new flowbee.FlowDiagram(canvas, this.options, this.specs);
    flow.render(text, file, animate);
  }
}

let workflow: Workflow | undefined;

window.addEventListener('message', async (event) => {
  const message = event.data; // The json data that the extension sent
  switch (message.type) {
    case 'init':
      workflow = new Workflow(message.base, message.specs);
      return;
    case 'update':
      // update webview's content
      workflow?.render(message.text, message.file);

      // persist state information
      // same state is returned in the call to `vscode.getState` below when a webview is reloaded.
      // vscode.setState({ text });

      return;
  }
});

