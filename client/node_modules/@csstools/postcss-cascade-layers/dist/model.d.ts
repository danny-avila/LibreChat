import type { AtRule } from 'postcss';
export declare class Model {
    anonymousLayerCount: number;
    layerCount: number;
    layerOrder: Map<string, number>;
    layerParamsParsed: Map<string, Array<string>>;
    layerNameParts: Map<string, Array<string>>;
    constructor();
    createAnonymousLayerName(): string;
    createImplicitLayerName(layerName: string): string;
    addLayerParams(key: string, parts?: string): void;
    addLayerParams(key: string, parts: Array<string>): void;
    addLayerNameParts(parts: string): void;
    addLayerNameParts(parts: Array<string>): void;
    getLayerParams(layer: AtRule): Array<string>;
    getLayerNameList(layerName: string): Array<string>;
    sortLayerNames(): void;
}
