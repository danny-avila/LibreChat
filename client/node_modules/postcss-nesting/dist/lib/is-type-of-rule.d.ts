import type { AtRule, Node, Rule } from 'postcss';
export declare function isAtRule(node?: Node): node is AtRule;
export declare function isNestRule(node?: Node): node is AtRule;
export declare function isRule(node?: Node): node is Rule;
