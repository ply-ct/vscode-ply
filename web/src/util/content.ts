import { Request, Response } from '../model/request';

export type ContentHolder = Request | Response;
export type Language = 'plaintext' | 'json' | 'html' | 'xml' | 'yaml';

export const getContentType = (holder: ContentHolder): string | undefined => {
    const key = Object.keys(holder.headers).find((k) => k.toLowerCase() === 'content-type');
    if (key) {
        let ct = holder.headers[key]?.trim();
        if (ct) {
            const semi = ct.indexOf(';');
            if (semi > 0) ct = ct.substring(0, semi).trim();
            return ct;
        }
    }
};

export const getLanguage = (
    holder: ContentHolder,
    defaultLang: Language = 'plaintext'
): Language => {
    const contentType = getContentType(holder);
    if (!contentType) return defaultLang;

    if (contentType === 'application/json' || holder.body?.startsWith('{')) {
        return 'json';
    } else if (contentType === 'text/html' || holder.body?.startsWith('<!DOCTYPE html>')) {
        return 'html';
    } else if (contentType === 'application/xml' || holder.body?.startsWith('<')) {
        return 'xml';
    } else if (contentType.endsWith('/yaml')) {
        return 'yaml';
    } else {
        return defaultLang;
    }
};
