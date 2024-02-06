/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['bulletOrdered'], null | undefined>}
 */
export function checkBulletOrdered(
  state: State
): Exclude<Options['bulletOrdered'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
