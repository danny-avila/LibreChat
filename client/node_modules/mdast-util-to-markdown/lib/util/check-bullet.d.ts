/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['bullet'], null | undefined>}
 */
export function checkBullet(
  state: State
): Exclude<Options['bullet'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
