import { Chart, ChartEvent, ActiveElement, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { TypedEvent, Listener, Disposable } from 'flowbee/dist/nostyles';
import { TestRunData, Dataset } from './data';
import { chartOptions } from './options';

Chart.register(...registerables);

export interface VizChartActionEvent {
    action: string;
    requestName: string;
}

export class VizChart {
    private detailChart: Chart;

    private _onChartAction = new TypedEvent<VizChartActionEvent>();
    onChartAction(listener: Listener<VizChartActionEvent>): Disposable {
        return this._onChartAction.on(listener);
    }

    constructor(readonly data: TestRunData) {
        this.detailChart = this.buildDetail(this.data.getRequestThroughput());
    }

    showRequestThroughput() {
        this.detailChart = this.buildDetail(this.data.getRequestThroughput());
    }

    showResponseTimes() {
        this.detailChart = this.buildDetail(this.data.getResponseTimes());
    }

    showRequestCounts() {
        this.detailChart = this.buildDetail(this.data.getRequestCounts());
    }

    private buildDetail(datasets: Dataset[]): Chart {
        this.detailChart?.destroy();
        const canvas = document.getElementById('viz-canvas') as HTMLCanvasElement;
        return new Chart(canvas.getContext('2d')!, {
            type: 'line',
            data: { datasets },
            options: {
                ...chartOptions,
                onClick: (_evt: ChartEvent, elems: ActiveElement[], chart: Chart) => {
                    if (elems.length) {
                        const label = chart.data.datasets[elems[0].datasetIndex].label;
                        if (label) {
                            this._onChartAction.emit({ action: 'select', requestName: label });
                        }
                    }
                }
            }
        });
    }
}
