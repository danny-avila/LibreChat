import type { Container, ChildNode, AtRule } from 'postcss';
export declare function someInTree(container: Container, predicate: (node: ChildNode) => boolean): boolean;
export declare function someAtRuleInTree(container: Container, predicate: (node: AtRule) => boolean): boolean;
