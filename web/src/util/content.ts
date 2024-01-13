import { Request, Response } from '../model/request';

export type ContentHolder = Request | Response;
export type Language = 'plaintext' | 'json' | 'html' | 'xml' | 'yaml' | 'graphql';

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
    if (contentType) {
        if (contentType === 'application/json') {
            return isGraphql(holder.body) ? 'graphql' : 'json';
        } else if (contentType === 'text/html') {
            return 'html';
        } else if (contentType === 'application/xml') {
            return 'xml';
        } else if (
            contentType?.endsWith('/yaml') ||
            contentType === 'application/vnd.oai.openapi' // TODO: what about json?
        ) {
            return 'yaml';
        }
    } else {
        // infer from content
        if (holder.body?.startsWith('{')) {
            return 'json';
        } else if (
            holder.body?.startsWith('<!DOCTYPE html>') ||
            holder.body?.startsWith('<!doctype html>')
        ) {
            return 'html';
        } else if (holder.body?.startsWith('<')) {
            return 'xml';
        } else if (isGraphql(holder.body)) {
            return 'graphql';
        }
    }

    return defaultLang;
};

const isGraphql = (body?: string): boolean => {
    return !!(body?.startsWith('query') || body?.startsWith('mutation'));
};
