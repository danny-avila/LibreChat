import type { Node, Root } from 'postcss';
export declare function collectCascadeLayerOrder(root: Root): WeakMap<Node, number>;
export declare function cascadeLayerNumberForNode(node: Node, layers: WeakMap<Node, number>): number | undefined;
