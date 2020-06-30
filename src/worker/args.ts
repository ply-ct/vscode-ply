export interface WorkerArgs {
    cwd: string;
    plyees: string[];  // Plyee paths
    plyPath: string;
    plyOptions: object;
    plyValues: object;
    logEnabled: boolean;
    workerScript: string;
    debugPort: number;
}