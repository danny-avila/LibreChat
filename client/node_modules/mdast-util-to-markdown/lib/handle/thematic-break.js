/**
 * @typedef {import('mdast').ThematicBreak} ThematicBreak
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 */

import {checkRuleRepetition} from '../util/check-rule-repetition.js'
import {checkRule} from '../util/check-rule.js'

/**
 * @param {ThematicBreak} _
 * @param {Parent | undefined} _1
 * @param {State} state
 * @returns {string}
 */
export function thematicBreak(_, _1, state) {
  const value = (
    checkRule(state) + (state.options.ruleSpaces ? ' ' : '')
  ).repeat(checkRuleRepetition(state))

  return state.options.ruleSpaces ? value.slice(0, -1) : value
}
