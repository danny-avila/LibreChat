/**
 * @param {Link} node
 * @param {State} state
 * @returns {boolean}
 */
export function formatLinkAsAutolink(node: Link, state: State): boolean
export type Link = import('mdast').Link
export type State = import('../types.js').State
