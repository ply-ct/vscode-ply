export interface WorkerArgs {
    cwd: string;
    plyees: string[];  // Plyee paths
    plyPath: string;
    plyOptions: object;
    runOptions?: object;
    logEnabled: boolean;
    workerScript: string;
    debugPort: number;
}