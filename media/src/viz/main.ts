import { TestRunData } from './data';
import { VizChart } from './chart';
import { VizTable } from './table';

// @ts-ignore
const vscode = acquireVsCodeApi();

const title = document.getElementById('viz-title') as HTMLDivElement;
title.innerText = 'Requests Submitted per Second';

let vizChart: VizChart | undefined;
let vizTable: VizTable | undefined;

const select = document.getElementById('viz-select') as HTMLSelectElement;
select.onchange = () => {
    if (select.value === 'Request Throughput') {
        title.innerText = 'Requests Submitted per Second';
        vizChart?.showRequestThroughput();
    } else if (select.value === 'Response Times') {
        title.innerText = 'Mean Response Times (ms)';
        vizChart?.showResponseTimes();
    } else {
        title.innerText = 'Cumulative Requests';
        vizChart?.showRequestCounts();
    }
};

window.addEventListener('message', async (event) => {
    const message = event.data; // json message data from extension
    // console.debug(`message: ${JSON.stringify(message, null, 2)}`);
    if (message.type === 'update') {
        const file = message.file;
        const testRunData = new TestRunData(message.runs, { intervals: 10 });
        vizChart = new VizChart(testRunData);
        vizChart.onChartAction((chartAction) => {
            vizTable?.setRequest(chartAction.requestName);
        });
        vizTable = new VizTable(testRunData);
        vizTable.onTableAction((tableAction) => {
            vscode.postMessage({
                type: tableAction.action,
                request: `${file}#${tableAction.requestRun.test}`,
                runNumber: tableAction.requestRun.run - 1
            });
        });
    }
});
