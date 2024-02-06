import type { Declaration } from 'postcss';
import { DirectionConfig } from './types';
export declare function transformBorder(borderSetting: string, side: string): (declaration: Declaration) => Array<Declaration>;
export declare function transformBorderProperty(borderSetting: string, side: [string, string]): (declaration: Declaration) => Array<Declaration>;
export declare function transformBorderShorthand(side: [string] | [string, string]): (declaration: Declaration) => Array<Declaration>;
export declare function transformBorderRadius(config: DirectionConfig): (declaration: Declaration) => Array<Declaration>;
