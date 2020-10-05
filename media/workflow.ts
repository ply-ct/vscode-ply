import { Flow, LIGHT_OPTIONS, DARK_OPTIONS } from 'flowbee';

const renderState = false;
const animate = false;

const doRender = (text: string, file: string) => {
    const canvas = document.getElementById('my-canvas') as HTMLCanvasElement;
    const options = document.body.className === 'vscode-light' ? LIGHT_OPTIONS : DARK_OPTIONS;
    const flow = new Flow(canvas, options);
    flow.render(text, file);
};

window.addEventListener('message', event => {
  const message = event.data; // The json data that the extension sent
  switch (message.type) {
    case 'update':
      // update webview's content
      doRender(message.text, message.file);

      // Then persist state information.
      // This state is returned in the call to `vscode.getState` below when a webview is reloaded.
      // vscode.setState({ text });

      return;
  }
});

