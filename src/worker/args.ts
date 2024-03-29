export interface WorkerArgs {
    cwd: string;
    env: { [name: string]: string };
    plyees: string[]; // Plyee paths
    plyPath?: string;
    plyVersion: string;
    plyOptions: object;
    runOptions?: object;
    logEnabled: boolean;
    debugPort: number;
}
