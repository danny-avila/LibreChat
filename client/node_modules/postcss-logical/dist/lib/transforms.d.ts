import { Axes, DirectionConfig, TransformFunction } from './types';
export declare function prepareTransforms(directionConfig: DirectionConfig, blockStart: Axes, blockEnd: Axes, inlineStart: Axes, inlineEnd: Axes): Record<string, TransformFunction | null>;
