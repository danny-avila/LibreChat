/**
 * @param {State} state
 * @returns {Exclude<Options['bulletOrdered'], null | undefined>}
 */
export function checkBulletOrderedOther(
  state: State
): Exclude<Options['bulletOrdered'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
