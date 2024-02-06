/**
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').ElementContent} ElementContent
 * @typedef {import('hast').Properties} Properties
 * @typedef {import('mdast').LinkReference} LinkReference
 * @typedef {import('../state.js').State} State
 */

import {normalizeUri} from 'micromark-util-sanitize-uri'
import {revert} from '../revert.js'

/**
 * Turn an mdast `linkReference` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {LinkReference} node
 *   mdast node.
 * @returns {ElementContent | Array<ElementContent>}
 *   hast node.
 */
export function linkReference(state, node) {
  const def = state.definition(node.identifier)

  if (!def) {
    return revert(state, node)
  }

  /** @type {Properties} */
  const properties = {href: normalizeUri(def.url || '')}

  if (def.title !== null && def.title !== undefined) {
    properties.title = def.title
  }

  /** @type {Element} */
  const result = {
    type: 'element',
    tagName: 'a',
    properties,
    children: state.all(node)
  }
  state.patch(node, result)
  return state.applyData(node, result)
}
