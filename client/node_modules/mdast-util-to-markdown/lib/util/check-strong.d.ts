/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['strong'], null | undefined>}
 */
export function checkStrong(
  state: State
): Exclude<Options['strong'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
