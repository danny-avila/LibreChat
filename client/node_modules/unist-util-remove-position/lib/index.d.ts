/**
 * Remove the `position` field from a tree.
 *
 * @template {Node} Tree
 *   Node type.
 * @param {Tree} tree
 *   Tree to clean.
 * @param {Options | boolean | null | undefined} [options]
 *   Configuration.
 * @returns {Tree}
 *   The given, modified, `tree`.
 */
export function removePosition<
  Tree extends import('unist').Node<import('unist').Data>
>(tree: Tree, options?: Options | boolean | null | undefined): Tree
export type Node = import('unist').Node
/**
 * Configuration.
 */
export type Options = {
  /**
   * Whether to use `delete` to remove `position` fields.
   *
   * The default is to set them to `undefined`.
   */
  force?: boolean | null | undefined
}
