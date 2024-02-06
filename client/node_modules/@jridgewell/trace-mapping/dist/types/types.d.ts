import type { SourceMapSegment } from './sourcemap-segment';
import type { GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND, TraceMap } from './trace-mapping';
export interface SourceMapV3 {
    file?: string | null;
    names: string[];
    sourceRoot?: string;
    sources: (string | null)[];
    sourcesContent?: (string | null)[];
    version: 3;
}
export interface EncodedSourceMap extends SourceMapV3 {
    mappings: string;
}
export interface DecodedSourceMap extends SourceMapV3 {
    mappings: SourceMapSegment[][];
}
export interface Section {
    offset: {
        line: number;
        column: number;
    };
    map: EncodedSourceMap | DecodedSourceMap | SectionedSourceMap;
}
export interface SectionedSourceMap {
    file?: string | null;
    sections: Section[];
    version: 3;
}
export type OriginalMapping = {
    source: string | null;
    line: number;
    column: number;
    name: string | null;
};
export type InvalidOriginalMapping = {
    source: null;
    line: null;
    column: null;
    name: null;
};
export type GeneratedMapping = {
    line: number;
    column: number;
};
export type InvalidGeneratedMapping = {
    line: null;
    column: null;
};
export type Bias = typeof GREATEST_LOWER_BOUND | typeof LEAST_UPPER_BOUND;
export type SourceMapInput = string | Ro<EncodedSourceMap> | Ro<DecodedSourceMap> | TraceMap;
export type SectionedSourceMapInput = SourceMapInput | Ro<SectionedSourceMap>;
export type Needle = {
    line: number;
    column: number;
    bias?: Bias;
};
export type SourceNeedle = {
    source: string;
    line: number;
    column: number;
    bias?: Bias;
};
export type EachMapping = {
    generatedLine: number;
    generatedColumn: number;
    source: null;
    originalLine: null;
    originalColumn: null;
    name: null;
} | {
    generatedLine: number;
    generatedColumn: number;
    source: string | null;
    originalLine: number;
    originalColumn: number;
    name: string | null;
};
export declare abstract class SourceMap {
    version: SourceMapV3['version'];
    file: SourceMapV3['file'];
    names: SourceMapV3['names'];
    sourceRoot: SourceMapV3['sourceRoot'];
    sources: SourceMapV3['sources'];
    sourcesContent: SourceMapV3['sourcesContent'];
    resolvedSources: SourceMapV3['sources'];
}
export type Ro<T> = T extends Array<infer V> ? V[] | Readonly<V[]> | RoArray<V> | Readonly<RoArray<V>> : T extends object ? T | Readonly<T> | RoObject<T> | Readonly<RoObject<T>> : T;
type RoArray<T> = Ro<T>[];
type RoObject<T> = {
    [K in keyof T]: T[K] | Ro<T[K]>;
};
export {};
