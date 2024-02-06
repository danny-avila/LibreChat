import type { Options } from './types';
export declare function resolveUrl(url: string, baseUrl: string | null): string;
export declare const uuid: () => string;
export declare function delay<T>(ms: number): (args: T) => Promise<T>;
export declare function toArray<T>(arrayLike: any): T[];
export declare function getImageSize(targetNode: HTMLElement, options?: Options): {
    width: number;
    height: number;
};
export declare function getPixelRatio(): number;
export declare function checkCanvasDimensions(canvas: HTMLCanvasElement): void;
export declare function canvasToBlob(canvas: HTMLCanvasElement, options?: Options): Promise<Blob | null>;
export declare function createImage(url: string): Promise<HTMLImageElement>;
export declare function svgToDataURL(svg: SVGElement): Promise<string>;
export declare function nodeToDataURL(node: HTMLElement, width: number, height: number): Promise<string>;
export declare const isInstanceOfElement: <T extends {
    new (): Element;
    prototype: Element;
} | {
    new (): HTMLElement;
    prototype: HTMLElement;
} | {
    new (): SVGImageElement;
    prototype: SVGImageElement;
}>(node: Element | HTMLElement | SVGImageElement, instance: T) => node is T["prototype"];
