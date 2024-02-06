/**
 * @typedef {import('hast').ElementContent} ElementContent
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Properties} Properties
 * @typedef {import('mdast').ImageReference} ImageReference
 * @typedef {import('../state.js').State} State
 */

import {normalizeUri} from 'micromark-util-sanitize-uri'
import {revert} from '../revert.js'

/**
 * Turn an mdast `imageReference` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {ImageReference} node
 *   mdast node.
 * @returns {ElementContent | Array<ElementContent>}
 *   hast node.
 */
export function imageReference(state, node) {
  const def = state.definition(node.identifier)

  if (!def) {
    return revert(state, node)
  }

  /** @type {Properties} */
  const properties = {src: normalizeUri(def.url || ''), alt: node.alt}

  if (def.title !== null && def.title !== undefined) {
    properties.title = def.title
  }

  /** @type {Element} */
  const result = {type: 'element', tagName: 'img', properties, children: []}
  state.patch(node, result)
  return state.applyData(node, result)
}
