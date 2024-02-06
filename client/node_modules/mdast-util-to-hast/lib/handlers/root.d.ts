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
export function root(state: State, node: MdastRoot): HastRoot | HastElement
export type HastRoot = import('hast').Root
export type HastElement = import('hast').Element
export type MdastRoot = import('mdast').Root
export type State = import('../state.js').State
