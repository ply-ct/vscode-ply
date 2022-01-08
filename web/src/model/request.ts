export const DUMMY_URL = 'https://ply-ct.org/movies';

export interface Request {
    name: string;
    url: string;
    method: string;
    headers: { [key: string]: string };
    body?: string;
    submitted?: Date;
    source: string;
}

export interface Response {
    status: {
        /**
         * zero means no results, negative means error like can't connect
         */
        code: number;
        message: string;
    };
    headers: { [key: string]: string };
    body?: string;
    submitted?: Date;
    time?: number;
    source?: string;
    loading: boolean;
}