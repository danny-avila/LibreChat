/**
 * @typedef {import('hast').Root} HastRoot
 * @typedef {import('hast').Element} HastElement
 * @typedef {import('mdast').Root} MdastRoot
 * @typedef {import('../state.js').State} State
 */

/**
 * Turn an mdast `root` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {MdastRoot} node
 *   mdast node.
 * @returns {HastRoot | HastElement}
 *   hast node.
 */
export function root(state, node) {
  /** @type {HastRoot} */
  const result = {type: 'root', children: state.wrap(state.all(node))}
  state.patch(node, result)
  return state.applyData(node, result)
}
