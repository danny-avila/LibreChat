import type { Declaration, Postcss } from 'postcss';
import { TransformFunction } from './types';
export declare function transformTransition(declaration: Declaration, postcss: Postcss, transforms: Record<string, TransformFunction | null>): Array<Declaration>;
