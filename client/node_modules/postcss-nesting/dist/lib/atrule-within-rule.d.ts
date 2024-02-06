import { options } from './options.js';
import { walkFunc } from './walk-func.js';
import type { AtRule, Result, Rule } from 'postcss';
export default function atruleWithinRule(node: AtRule, parent: Rule, result: Result, walk: walkFunc, opts: options): void;
export declare function isAtruleWithinRule(node: AtRule): boolean;
