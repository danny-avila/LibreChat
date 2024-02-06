/**
 * Turn an mdast `footnote` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {Footnote} node
 *   mdast node.
 * @returns {Element}
 *   hast node.
 */
export function footnote(state: State, node: Footnote): Element
export type Element = import('hast').Element
export type Footnote = import('mdast').Footnote
export type State = import('../state.js').State
