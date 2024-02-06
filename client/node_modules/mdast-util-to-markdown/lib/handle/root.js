/**
 * @typedef {import('mdast').Root} Root
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Info} Info
 */

import {phrasing} from 'mdast-util-phrasing'

/**
 * @param {Root} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function root(node, _, state, info) {
  // Note: `html` nodes are ambiguous.
  const hasPhrasing = node.children.some((d) => phrasing(d))
  const fn = hasPhrasing ? state.containerPhrasing : state.containerFlow
  // @ts-expect-error: `root`s are supposed to have one type of content
  return fn.call(state, node, info)
}
