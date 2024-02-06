import type { Result, Rule } from 'postcss';
import type { Root } from 'postcss-selector-parser';
export declare function transformRule(rule: Rule, result: Result, customSelectors: Map<string, Root>): null | string;
