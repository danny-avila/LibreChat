/**
 * @typedef {import('mdast').FootnoteReference} FootnoteReference
 * @typedef {import('hast').Element} Element
 * @typedef {import('../state.js').State} State
 */

import {normalizeUri} from 'micromark-util-sanitize-uri'

/**
 * Turn an mdast `footnoteReference` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {FootnoteReference} node
 *   mdast node.
 * @returns {Element}
 *   hast node.
 */
export function footnoteReference(state, node) {
  const id = String(node.identifier).toUpperCase()
  const safeId = normalizeUri(id.toLowerCase())
  const index = state.footnoteOrder.indexOf(id)
  /** @type {number} */
  let counter

  if (index === -1) {
    state.footnoteOrder.push(id)
    state.footnoteCounts[id] = 1
    counter = state.footnoteOrder.length
  } else {
    state.footnoteCounts[id]++
    counter = index + 1
  }

  const reuseCounter = state.footnoteCounts[id]

  /** @type {Element} */
  const link = {
    type: 'element',
    tagName: 'a',
    properties: {
      href: '#' + state.clobberPrefix + 'fn-' + safeId,
      id:
        state.clobberPrefix +
        'fnref-' +
        safeId +
        (reuseCounter > 1 ? '-' + reuseCounter : ''),
      dataFootnoteRef: true,
      ariaDescribedBy: ['footnote-label']
    },
    children: [{type: 'text', value: String(counter)}]
  }
  state.patch(node, link)

  /** @type {Element} */
  const sup = {
    type: 'element',
    tagName: 'sup',
    properties: {},
    children: [link]
  }
  state.patch(node, sup)
  return state.applyData(node, sup)
}
