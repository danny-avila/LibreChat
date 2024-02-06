/**
 * Continue traversing as normal.
 */
export const CONTINUE: true;
/**
 * Stop traversing immediately.
 */
export const EXIT: false;
/**
 * Do not traverse this node’s children.
 */
export const SKIP: "skip";
/**
 * Visit nodes, with ancestral information.
 *
 * This algorithm performs *depth-first* *tree traversal* in *preorder*
 * (**NLR**) or if `reverse` is given, in *reverse preorder* (**NRL**).
 *
 * You can choose for which nodes `visitor` is called by passing a `test`.
 * For complex tests, you should test yourself in `visitor`, as it will be
 * faster and will have improved type information.
 *
 * Walking the tree is an intensive task.
 * Make use of the return values of the visitor when possible.
 * Instead of walking a tree multiple times, walk it once, use `unist-util-is`
 * to check if a node matches, and then perform different operations.
 *
 * You can change the tree.
 * See `Visitor` for more info.
 *
 * @param tree
 *   Tree to traverse.
 * @param test
 *   `unist-util-is`-compatible test
 * @param visitor
 *   Handle each node.
 * @param reverse
 *   Traverse in reverse preorder (NRL) instead of the default preorder (NLR).
 * @returns
 *   Nothing.
 */
export const visitParents: (<Tree extends import("unist").Node<import("unist").Data>, Check extends import("unist-util-is/lib/index.js").Test>(tree: Tree, test: Check, visitor: BuildVisitor<Tree, Check>, reverse?: boolean | null | undefined) => void) & (<Tree_1 extends import("unist").Node<import("unist").Data>>(tree: Tree_1, visitor: BuildVisitor<Tree_1, string>, reverse?: boolean | null | undefined) => void);
export type Node = import('unist').Node;
export type Parent = import('unist').Parent;
export type Test = import('unist-util-is').Test;
/**
 * Union of the action types.
 */
export type Action = boolean | 'skip';
/**
 * Move to the sibling at `index` next (after node itself is completely
 * traversed).
 *
 * Useful if mutating the tree, such as removing the node the visitor is
 * currently on, or any of its previous siblings.
 * Results less than 0 or greater than or equal to `children.length` stop
 * traversing the parent.
 */
export type Index = number;
/**
 * List with one or two values, the first an action, the second an index.
 */
export type ActionTuple = [(Action | null | undefined | void)?, (Index | null | undefined)?];
/**
 * Any value that can be returned from a visitor.
 */
export type VisitorResult = Action | [(void | Action | null | undefined)?, (number | null | undefined)?] | Index | null | undefined | void;
/**
 * Handle a node (matching `test`, if given).
 *
 * Visitors are free to transform `node`.
 * They can also transform the parent of node (the last of `ancestors`).
 *
 * Replacing `node` itself, if `SKIP` is not returned, still causes its
 * descendants to be walked (which is a bug).
 *
 * When adding or removing previous siblings of `node` (or next siblings, in
 * case of reverse), the `Visitor` should return a new `Index` to specify the
 * sibling to traverse after `node` is traversed.
 * Adding or removing next siblings of `node` (or previous siblings, in case
 * of reverse) is handled as expected without needing to return a new `Index`.
 *
 * Removing the children property of an ancestor still results in them being
 * traversed.
 */
export type Visitor<Visited extends import("unist").Node<import("unist").Data> = import("unist").Node<import("unist").Data>, Ancestor extends import("unist").Parent<import("unist").Node<import("unist").Data>, import("unist").Data> = import("unist").Parent<import("unist").Node<import("unist").Data>, import("unist").Data>> = (node: Visited, ancestors: Array<Ancestor>) => VisitorResult;
/**
 * Build a typed `Visitor` function from a tree and a test.
 *
 * It will infer which values are passed as `node` and which as `parents`.
 */
export type BuildVisitor<Tree extends import("unist").Node<import("unist").Data> = import("unist").Node<import("unist").Data>, Check extends import("unist-util-is/lib/index.js").Test = string> = Visitor<import('./complex-types.js').Matches<import('./complex-types.js').InclusiveDescendant<Tree>, Check>, Extract<import('./complex-types.js').InclusiveDescendant<Tree>, Parent>>;
