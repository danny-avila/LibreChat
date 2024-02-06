import type { Options } from './types';
export declare function getWebFontCSS<T extends HTMLElement>(node: T, options: Options): Promise<string>;
export declare function embedWebFonts<T extends HTMLElement>(clonedNode: T, options: Options): Promise<void>;
