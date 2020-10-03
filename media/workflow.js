import { Flow } from 'flowbee';

const renderState = false;
const animate = false;

const doRender = (text, file) => {
    const canvas = document.getElementById('my-canvas');
    const flow = new Flow(canvas);
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

