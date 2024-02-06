import type { Node } from 'postcss-selector-parser';
export type Specificity = {
    a: number;
    b: number;
    c: number;
};
export declare function compare(s1: Specificity, s2: Specificity): number;
export declare function selectorSpecificity(node: Node): Specificity;
