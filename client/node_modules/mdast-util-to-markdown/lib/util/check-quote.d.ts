/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['quote'], null | undefined>}
 */
export function checkQuote(
  state: State
): Exclude<Options['quote'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
