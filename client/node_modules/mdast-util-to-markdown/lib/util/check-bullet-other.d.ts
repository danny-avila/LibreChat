/**
 * @param {State} state
 * @returns {Exclude<Options['bullet'], null | undefined>}
 */
export function checkBulletOther(
  state: State
): Exclude<Options['bullet'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
