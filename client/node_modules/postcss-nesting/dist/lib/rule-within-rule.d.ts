import type { Result, Rule } from 'postcss';
import { options } from './options.js';
export default function transformRuleWithinRule(node: Rule, parent: Rule, result: Result, opts: options): void;
export declare function isValidRuleWithinRule(node: Rule): boolean;
