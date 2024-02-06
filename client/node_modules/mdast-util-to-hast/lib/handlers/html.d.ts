/**
 * @typedef {import('hast').Element} Element
 * @typedef {import('mdast').HTML} Html
 * @typedef {import('../state.js').State} State
 * @typedef {import('../../index.js').Raw} Raw
 */
/**
 * Turn an mdast `html` node into hast (`raw` node in dangerous mode, otherwise
 * nothing).
 *
 * @param {State} state
 *   Info passed around.
 * @param {Html} node
 *   mdast node.
 * @returns {Raw | Element | null}
 *   hast node.
 */
export function html(state: State, node: Html): Raw | Element | null
export type Element = import('hast').Element
export type Html = import('mdast').HTML
export type State = import('../state.js').State
export type Raw = import('../../index.js').Raw
