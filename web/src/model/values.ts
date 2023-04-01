export interface Values {
    env: { [key: string]: string };
    objects: { [path: string]: object };
    trusted?: boolean;
}
