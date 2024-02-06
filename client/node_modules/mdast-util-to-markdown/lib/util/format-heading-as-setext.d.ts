/**
 * @param {Heading} node
 * @param {State} state
 * @returns {boolean}
 */
export function formatHeadingAsSetext(node: Heading, state: State): boolean
export type Heading = import('mdast').Heading
export type State = import('../types.js').State
