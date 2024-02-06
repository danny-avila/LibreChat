/**
 * Find the first node in `parent` after another `node` or after an index,
 * that passes `test`.

 * @param parent
 *   Parent node.
 * @param index
 *   Child of `parent` or it’s index.
 * @param test
 *   `unist-util-is`-compatible test.
 * @returns
 *   Child of `parent` or `null`.
 */
export const findAfter: (<T extends import("unist").Node<import("unist").Data>>(node: Parent, index: Node | number, test: import("unist-util-is").PredicateTest<T>) => T | null) & ((node: Parent, index: Node | number, test?: Test) => Node | null);
export type Node = import('unist').Node;
export type Parent = import('unist').Parent;
export type Test = import('unist-util-is').Test;
