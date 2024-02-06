import type { Declaration } from 'postcss';
import { DirectionConfig } from './types';
export declare function transformValue(config: DirectionConfig): (declaration: Declaration) => Array<Declaration>;
