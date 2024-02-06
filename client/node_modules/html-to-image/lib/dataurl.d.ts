import { Options } from './types';
export declare function isDataUrl(url: string): boolean;
export declare function makeDataUrl(content: string, mimeType: string): string;
export declare function fetchAsDataURL<T>(url: string, init: RequestInit | undefined, process: (data: {
    result: string;
    res: Response;
}) => T): Promise<T>;
export declare function resourceToDataURL(resourceUrl: string, contentType: string | undefined, options: Options): Promise<string>;
