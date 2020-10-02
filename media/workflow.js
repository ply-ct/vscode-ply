import { DiagramFactory, LabelFactory } from 'flowbee';

const renderState = false;
const animate = false;

// TODO URI can be http or file system
const url = 'http://localhost:8080/mdw/services/Workflow/com.centurylink.mdw.tests.milestones/MilestonesMain.proc';

const doRender = (text) => {
    const canvas = document.getElementById('my-canvas');
    console.log("DiagramFactory is " + typeof DiagramFactory);
    console.log("LabelFactory is " + typeof LabelFactory);

    // console.log("DOING GREETING");
    // const dc = new DonsClass('HELLO');
    // dc.greet();
    // console.log("FLOWBEE: " + JSON.stringify(flowbee, null, 2));
    // const ShapeFactory = flowbee.ShapeFactory;

    // const flow = new Flow(canvas);
    // flow.render(text, 'todo');
};

window.addEventListener('message', event => {
  const message = event.data; // The json data that the extension sent
  switch (message.type) {
    case 'update':
      // const text = message.text;

      console.log("TEXT: " + message.text);


      // Update our webview's content
      doRender(message.text);

      // Then persist state information.
      // This state is returned in the call to `vscode.getState` below when a webview is reloaded.
      // vscode.setState({ text });

      return;
  }
});

