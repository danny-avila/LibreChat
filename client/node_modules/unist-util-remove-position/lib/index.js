/**
 * @typedef {import('unist').Node} Node
 */

/**
 * @typedef Options
 *   Configuration.
 * @property {boolean | null | undefined} [force=false]
 *   Whether to use `delete` to remove `position` fields.
 *
 *   The default is to set them to `undefined`.
 */

import {visit} from 'unist-util-visit'

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
// To do: next major: return `void`.
// To do: remove `force` shortcut, replace with options.
export function removePosition(tree, options) {
  const force =
    typeof options === 'boolean' ? options : options ? options.force : false

  visit(tree, remove)

  return tree

  /**
   * @param {Node} node
   */
  function remove(node) {
    if (force) {
      delete node.position
    } else {
      node.position = undefined
    }
  }
}
