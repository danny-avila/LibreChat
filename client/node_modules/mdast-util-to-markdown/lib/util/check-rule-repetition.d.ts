/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */
/**
 * @param {State} state
 * @returns {Exclude<Options['ruleRepetition'], null | undefined>}
 */
export function checkRuleRepetition(
  state: State
): Exclude<Options['ruleRepetition'], null | undefined>
export type State = import('../types.js').State
export type Options = import('../types.js').Options
