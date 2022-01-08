let lvl: 'info' | 'debug' = 'debug';

export const loglvl = (l: 'info' | 'debug') => {
    lvl = l;
};

export const logtmsg = (t: string, msg = '') => {
    console[lvl](`${t} ${msg}`);
};

export const logtime = (msg = '') => {
    const date = new Date();
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    const millis = String(date.getMilliseconds()).padStart(3, '0');
    const str = `${hrs} ${mins} ${secs} ${millis} ${msg}`;
    console[lvl](str);
};
