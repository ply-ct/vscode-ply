import * as flowbee from 'flowbee';

export class Toolbox {

    constructor(
        readonly base: string,
        readonly specs: flowbee.Specifier[]
    ) { }

    render() {
        const div = document.getElementById('workflow-toolbox') as HTMLElement;
        const ul = div.getElementsByTagName('ul')[0] as HTMLUListElement;
        let tabIndex = 1000;
        for (const spec of this.specs) {
            const li = document.createElement("li") as HTMLLIElement;
            li.setAttribute('id', spec.id);
            li.tabIndex = tabIndex;
            const iconDiv = document.createElement("div") as HTMLDivElement;
            iconDiv.className = 'toolbox-icon';
            const iconImg = document.createElement("img") as HTMLImageElement;
            iconImg.src = `${this.base}/icons/${spec.icon}`;
            iconDiv.appendChild(iconImg);
            li.appendChild(iconDiv);
            const labelDiv = document.createElement("div") as HTMLDivElement;
            labelDiv.className = 'toolbox-label';
            labelDiv.style.color = document.body.className.endsWith('vscode-light') ? '#616161' : '#cccccc';
            labelDiv.appendChild(document.createTextNode(spec.label));
            li.appendChild(labelDiv);
            ul.appendChild(li);
            tabIndex++;
        }

        // events
        ul.onmousedown = (e: MouseEvent) => {
            let el = e.target as HTMLElement;
            if (el.tagName !== 'LI') {
              while ((el = el.parentElement as HTMLElement) && el.tagName !== 'LI') {
                // find
              }
            }
            if (el) {
                vscode.postMessage({ type: 'select', selected: el.id });
            }
        };
        ul.onmouseup = (_e: MouseEvent) => {
            vscode.postMessage({ type: 'select', selected: null });
        };
        ul.onmouseout = (e: MouseEvent) => {
            if (e.buttons !== 1) {
                vscode.postMessage({ type: 'select', selected: null });
            }
        };
    }
}

// @ts-ignore
const vscode = acquireVsCodeApi();

window.addEventListener('message', async (event) => {
    const message = event.data; // json message data from extension
    console.debug(`message: ${JSON.stringify(message, null, 2)}`);
    if (message.type === 'update') {
        const toolbox = new Toolbox(message.base, message.specs);
        toolbox.render();
        // save state
        const { base, specs } = message;
        vscode.setState({ base, specs });
    }
});

const state = vscode.getState();
if (state) {
    const toolbox = new Toolbox(state.base, state.specs);
    toolbox.render();
}
