import { Table, TypedEvent, Listener, Disposable } from 'flowbee/dist/nostyles';
import { RequestRun, TestRunData } from './data';

export interface VizTableActionEvent {
    action: string;
    requestRun: RequestRun;
}

export class VizTable {
    private _onTableAction = new TypedEvent<VizTableActionEvent>();
    onTableAction(listener: Listener<VizTableActionEvent>): Disposable {
        return this._onTableAction.on(listener);
    }

    constructor(private testRunData: TestRunData) {
        const requestNames = Object.keys(testRunData.requestRuns);
        if (requestNames.length > 0) {
            this.setRequest(requestNames[0]);
        }
    }

    setRequest(requestName: string) {
        const dataDiv = document.getElementById('viz-data') as HTMLDivElement;
        dataDiv.innerHTML = '';

        const theme = document.body.className.endsWith('vscode-light') ? 'light' : 'dark';
        // dataDiv.className = `flowbee-configurator-${theme} viz-data`;

        const requestRuns = this.testRunData.requestRuns[requestName];
        const rows = requestRuns.map((requestRun) => {
            return [
                requestRun.name,
                requestRun.test,
                new Date(requestRun.submittedTime).toLocaleTimeString(),
                requestRun.request.url,
                '' + requestRun.response?.time || ''
            ];
        });

        const table = new Table(
            [
                { type: 'link', label: 'Request', action: 'request' },
                { type: 'text', label: 'ID' },
                { type: 'text', label: 'Submitted' },
                { type: 'text', label: 'URL' },
                { type: 'text', label: 'Response ms' }
            ],
            JSON.stringify(rows),
            true
        );
        table.onTableAction((actionEvent) => {
            this._onTableAction.emit({
                action: actionEvent.action,
                requestRun: requestRuns[actionEvent.rownum]
            });
        });

        dataDiv.appendChild(table.tableElement);
    }
}
