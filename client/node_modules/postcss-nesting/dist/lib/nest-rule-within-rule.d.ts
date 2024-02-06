import type { AtRule, Result, Rule } from 'postcss';
import { walkFunc } from './walk-func.js';
import { options } from './options.js';
export default function transformNestRuleWithinRule(node: AtRule, parent: Rule, result: Result, walk: walkFunc, opts: options): void;
export declare function isValidNestRuleWithinRule(node: AtRule): boolean;
