import { Options } from './types';
export declare function parseURLs(cssText: string): string[];
export declare function embed(cssText: string, resourceURL: string, baseURL: string | null, options: Options, getContentFromUrl?: (url: string) => Promise<string>): Promise<string>;
export declare function shouldEmbed(url: string): boolean;
export declare function embedResources(cssText: string, baseUrl: string | null, options: Options): Promise<string>;
