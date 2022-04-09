import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { TestRunData, Dataset } from './data';
import { chartOptions } from './options';

Chart.register(...registerables);

export class VizChart {
    private detailChart: Chart;

    constructor(readonly data: TestRunData) {
        this.detailChart = this.buildDetail(this.data.getRequestCounts());
    }

    showRequestCounts() {
        this.detailChart = this.buildDetail(this.data.getRequestCounts());
    }

    showRequestThroughput() {
        this.detailChart = this.buildDetail(this.data.getRequestThroughput());
    }

    showResponseTimes() {
        this.detailChart = this.buildDetail(this.data.getResponseTimes());
    }

    private buildDetail(datasets: Dataset[]): Chart {
        this.detailChart?.destroy();
        const canvas = document.getElementById('viz-canvas') as HTMLCanvasElement;
        return new Chart(canvas.getContext('2d')!, {
            type: 'line',
            data: { datasets },
            options: chartOptions
        });
    }
}
