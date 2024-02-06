/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['listItemIndent'], null | undefined>}
 */
export function checkListItemIndent(
  state: State
): Exclude<Options['listItemIndent'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
