/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['fence'], null | undefined>}
 */
export function checkFence(
  state: State
): Exclude<Options['fence'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
