/**
 * @typedef {import('mdast').Paragraph} Paragraph
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Info} Info
 */

/**
 * @param {Paragraph} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function paragraph(node, _, state, info) {
  const exit = state.enter('paragraph')
  const subexit = state.enter('phrasing')
  const value = state.containerPhrasing(node, info)
  subexit()
  exit()
  return value
}
