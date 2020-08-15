export interface WorkerArgs {
    cwd: string;
    plyees: string[];  // Plyee paths
    plyPath: string;
    plyOptions: object;
    plyValues: object;  // these are extra values
    runOptions?: object;
    logEnabled: boolean;
    workerScript: string;
    debugPort: number;
}