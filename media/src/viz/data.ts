import { PlyResults, TestRun, Request } from '@ply-ct/ply';
import { backgroundColor, borderColor } from './options';

export interface RunDataOptions {
    intervals: number;
}

export interface Datapoint {
    x: number;
    y: number;
}

export interface Dataset {
    label: string;
    data: Datapoint[];
    borderColor: string;
    backgroundColor: string;
}

export interface RequestRun extends TestRun {
    run: number;
    request: Request;
    submittedTime: number;
}

export class TestRunData {
    readonly requestRuns: { [name: string]: RequestRun[] } = {};
    /**
     * epoch timestamps
     */
    private firstSubmitted?: number;
    private lastSubmitted?: number;
    private lastResponded?: number;

    constructor(readonly results: PlyResults, readonly options: RunDataOptions) {
        results.runs.forEach((suiteRun) => {
            suiteRun.testRuns.forEach((testRun) => {
                if (testRun.type === 'request' && testRun.request?.submitted) {
                    const requestRun: RequestRun = {
                        ...testRun,
                        run: suiteRun.run,
                        request: testRun.request,
                        submittedTime: new Date(testRun.request.submitted).getTime()
                    };

                    if (!this.firstSubmitted) this.firstSubmitted = requestRun.submittedTime;
                    this.lastSubmitted = requestRun.submittedTime;
                    if (requestRun.response?.time) {
                        this.lastResponded = requestRun.submittedTime + requestRun.response.time;
                    }

                    let reqRuns = this.requestRuns[testRun.name];
                    if (!reqRuns) {
                        reqRuns = [];
                        this.requestRuns[testRun.name] = reqRuns;
                    }
                    reqRuns.push(requestRun);
                }
            });
        });
    }

    /**
     * floored to nearest second
     */
    private getStart(): number {
        if (this.firstSubmitted) return (Math.floor(this.firstSubmitted / 1000) - 1) * 1000;
        else return 0;
    }

    /**
     * ceiled to nex second
     */
    private getEnd(): number {
        const finish = Math.max(
            this.lastResponded || 0,
            this.lastSubmitted || 0,
            this.firstSubmitted || 0
        );
        return (Math.ceil(finish / 1000) + 1) * 1000;
    }

    getRequestCounts(): Dataset[] {
        const datasets: Dataset[] = [];
        const startTime = this.getStart();
        const endTime = this.getEnd();
        if (startTime && endTime) {
            const intervals = (endTime - startTime) / 1000;
            const runNames = Object.keys(this.requestRuns);
            for (let i = 0; i < runNames.length; i++) {
                let runCount = 0;
                const runName = runNames[i];
                const dataset: Dataset = {
                    label: runName,
                    data: [],
                    borderColor: borderColor(i),
                    backgroundColor: backgroundColor(i)
                };
                let start = startTime;
                for (let j = 0; j < intervals; j++) {
                    const end = start + 1000;
                    const intervalRuns = this.requestRuns[runName].filter((run) => {
                        return (
                            run.response?.time &&
                            run.submittedTime >= start &&
                            run.submittedTime < end
                        );
                    });
                    runCount += intervalRuns.length;
                    dataset.data.push({
                        x: Math.round(end),
                        y: runCount
                    });
                    start = end;
                }
                datasets.push(dataset);
            }
        }
        // console.log('DATASETS: ' + JSON.stringify(datasets, null, 2));
        return datasets;
    }

    getRequestThroughput(): Dataset[] {
        const datasets: Dataset[] = [];
        const startTime = this.getStart();
        const endTime = this.getEnd();
        if (startTime && endTime) {
            const intervals = (endTime - startTime) / 1000;
            const runNames = Object.keys(this.requestRuns);
            for (let i = 0; i < runNames.length; i++) {
                const runName = runNames[i];
                const dataset: Dataset = {
                    label: runName,
                    data: [],
                    borderColor: borderColor(i),
                    backgroundColor: backgroundColor(i)
                };
                let start = startTime;
                for (let j = 0; j < intervals; j++) {
                    const end = start + 1000;
                    const intervalRuns = this.requestRuns[runName].filter((run) => {
                        return (
                            run.response?.time &&
                            run.submittedTime >= start &&
                            run.submittedTime < end
                        );
                    });
                    dataset.data.push({
                        x: Math.round(end),
                        y: intervalRuns.length
                    });
                    start = end;
                }
                datasets.push(dataset);
            }
        }
        // console.log('DATASETS: ' + JSON.stringify(datasets, null, 2));
        return datasets;
    }

    getResponseTimes(): Dataset[] {
        const datasets: Dataset[] = [];
        const startTime = this.getStart();
        const endTime = this.getEnd();
        if (startTime && endTime) {
            const intervalMs = (endTime - startTime) / this.options.intervals;

            const runNames = Object.keys(this.requestRuns);
            for (let i = 0; i < runNames.length; i++) {
                const runName = runNames[i];
                const dataset: Dataset = {
                    label: runName,
                    data: [],
                    borderColor: borderColor(i),
                    backgroundColor: backgroundColor(i)
                };
                let start = startTime;
                for (let j = 0; j < this.options.intervals; j++) {
                    const end = start + intervalMs;
                    const intervalRuns = this.requestRuns[runName].filter((run) => {
                        return (
                            run.response?.time &&
                            run.submittedTime >= start &&
                            run.submittedTime < end
                        );
                    });
                    if (intervalRuns.length > 0) {
                        const totalResponseTime = intervalRuns.reduce((total, run) => {
                            return total + run.response!.time!;
                        }, 0);
                        dataset.data.push({
                            x: Math.round(end),
                            y: totalResponseTime / intervalRuns.length
                        });
                    }
                    start = end;
                }
                datasets.push(dataset);
            }
        }
        // console.log('DATASETS: ' + JSON.stringify(datasets, null, 2));
        return datasets;
    }
}
