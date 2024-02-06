/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['emphasis'], null | undefined>}
 */
export function checkEmphasis(
  state: State
): Exclude<Options['emphasis'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
