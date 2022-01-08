export interface Request {
    name: string;
    url: string;
    method: string;
    headers: { [key: string]: string };
    body?: string;
}
