import type { Declaration } from 'postcss';
import { DirectionConfig } from './types';
export declare function transformResize(directionConfig: DirectionConfig): (declaration: Declaration) => boolean;
