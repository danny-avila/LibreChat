/**
 * @typedef {import('mdast').List} List
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Info} Info
 */

import {checkBullet} from '../util/check-bullet.js'
import {checkBulletOther} from '../util/check-bullet-other.js'
import {checkBulletOrdered} from '../util/check-bullet-ordered.js'
import {checkBulletOrderedOther} from '../util/check-bullet-ordered-other.js'
import {checkRule} from '../util/check-rule.js'

/**
 * @param {List} node
 * @param {Parent | undefined} parent
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function list(node, parent, state, info) {
  const exit = state.enter('list')
  const bulletCurrent = state.bulletCurrent
  /** @type {string} */
  let bullet = node.ordered ? checkBulletOrdered(state) : checkBullet(state)
  /** @type {string} */
  const bulletOther = node.ordered
    ? checkBulletOrderedOther(state)
    : checkBulletOther(state)
  const bulletLastUsed = state.bulletLastUsed
  let useDifferentMarker = false

  if (
    parent &&
    // Explicit `other` set.
    (node.ordered
      ? state.options.bulletOrderedOther
      : state.options.bulletOther) &&
    bulletLastUsed &&
    bullet === bulletLastUsed
  ) {
    useDifferentMarker = true
  }

  if (!node.ordered) {
    const firstListItem = node.children ? node.children[0] : undefined

    // If there’s an empty first list item directly in two list items,
    // we have to use a different bullet:
    //
    // ```markdown
    // * - *
    // ```
    //
    // …because otherwise it would become one big thematic break.
    if (
      // Bullet could be used as a thematic break marker:
      (bullet === '*' || bullet === '-') &&
      // Empty first list item:
      firstListItem &&
      (!firstListItem.children || !firstListItem.children[0]) &&
      // Directly in two other list items:
      state.stack[state.stack.length - 1] === 'list' &&
      state.stack[state.stack.length - 2] === 'listItem' &&
      state.stack[state.stack.length - 3] === 'list' &&
      state.stack[state.stack.length - 4] === 'listItem' &&
      // That are each the first child.
      state.indexStack[state.indexStack.length - 1] === 0 &&
      state.indexStack[state.indexStack.length - 2] === 0 &&
      state.indexStack[state.indexStack.length - 3] === 0
    ) {
      useDifferentMarker = true
    }

    // If there’s a thematic break at the start of the first list item,
    // we have to use a different bullet:
    //
    // ```markdown
    // * ---
    // ```
    //
    // …because otherwise it would become one big thematic break.
    if (checkRule(state) === bullet && firstListItem) {
      let index = -1

      while (++index < node.children.length) {
        const item = node.children[index]

        if (
          item &&
          item.type === 'listItem' &&
          item.children &&
          item.children[0] &&
          item.children[0].type === 'thematicBreak'
        ) {
          useDifferentMarker = true
          break
        }
      }
    }
  }

  if (useDifferentMarker) {
    bullet = bulletOther
  }

  state.bulletCurrent = bullet
  const value = state.containerFlow(node, info)
  state.bulletLastUsed = bullet
  state.bulletCurrent = bulletCurrent
  exit()
  return value
}
