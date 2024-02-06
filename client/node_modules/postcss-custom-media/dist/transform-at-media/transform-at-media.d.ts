import { MediaQuery } from '@csstools/media-query-list-parser';
export declare function transformAtMediaListTokens(params: string, replacements: Map<string, {
    truthy: Array<MediaQuery>;
    falsy: Array<MediaQuery>;
}>): Array<{
    replaceWith: string;
    encapsulateWith?: string;
}>;
export declare function transformSimpleMediaQuery(mediaQuery: MediaQuery, replacements: Map<string, {
    truthy: Array<MediaQuery>;
    falsy: Array<MediaQuery>;
}>): {
    replaceWith: string;
    encapsulateWith?: string;
} | null;
export declare function transformComplexMediaQuery(mediaQuery: MediaQuery, replacements: Map<string, {
    truthy: Array<MediaQuery>;
    falsy: Array<MediaQuery>;
}>): Array<{
    replaceWith: string;
    encapsulateWith?: string;
}>;
