import { Options } from './types';
export declare function toSvg<T extends HTMLElement>(node: T, options?: Options): Promise<string>;
export declare function toCanvas<T extends HTMLElement>(node: T, options?: Options): Promise<HTMLCanvasElement>;
export declare function toPixelData<T extends HTMLElement>(node: T, options?: Options): Promise<Uint8ClampedArray>;
export declare function toPng<T extends HTMLElement>(node: T, options?: Options): Promise<string>;
export declare function toJpeg<T extends HTMLElement>(node: T, options?: Options): Promise<string>;
export declare function toBlob<T extends HTMLElement>(node: T, options?: Options): Promise<Blob | null>;
export declare function getFontEmbedCSS<T extends HTMLElement>(node: T, options?: Options): Promise<string>;
