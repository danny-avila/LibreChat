/**
 * @typedef {import('mdast').Code} Code
 * @typedef {import('../types.js').State} State
 */
/**
 * @param {Code} node
 * @param {State} state
 * @returns {boolean}
 */
export function formatCodeAsIndented(node: Code, state: State): boolean
export type Code = import('mdast').Code
export type State = import('../types.js').State
