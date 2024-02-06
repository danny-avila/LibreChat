import type { Declaration } from 'postcss';
import { DirectionConfig } from './types';
export declare function transformLogicalSize(directionConfig: DirectionConfig): (declaration: Declaration) => Array<Declaration>;
