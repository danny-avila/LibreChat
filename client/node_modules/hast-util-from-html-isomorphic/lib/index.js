/**
 * @typedef {import('hast').Root} Root
 * @typedef {Pick<import('hast-util-from-html').Options, 'fragment'>} Options
 */

import {fromHtml} from 'hast-util-from-html'
import {removePosition} from 'unist-util-remove-position'

/**
 * Turn HTML into a syntax tree, using browser APIs when available, so it has
 * a smaller bundle size there.
 *
 * @param {string} value
 *   Serialized HTML to parse.
 * @param {Options | null | undefined} [options]
 *   Configuration (optional).
 * @returns {Root}
 *   Tree.
 */
export function fromHtmlIsomorphic(value, options) {
  const tree = fromHtml(value, options)
  removePosition(tree, {force: true})
  delete tree.data
  return tree
}
