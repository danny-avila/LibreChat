/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */

import {checkBulletOrdered} from './check-bullet-ordered.js'

/**
 * @param {State} state
 * @returns {Exclude<Options['bulletOrdered'], null | undefined>}
 */
export function checkBulletOrderedOther(state) {
  const bulletOrdered = checkBulletOrdered(state)
  const bulletOrderedOther = state.options.bulletOrderedOther

  if (!bulletOrderedOther) {
    return bulletOrdered === '.' ? ')' : '.'
  }

  if (bulletOrderedOther !== '.' && bulletOrderedOther !== ')') {
    throw new Error(
      'Cannot serialize items with `' +
        bulletOrderedOther +
        '` for `options.bulletOrderedOther`, expected `*`, `+`, or `-`'
    )
  }

  if (bulletOrderedOther === bulletOrdered) {
    throw new Error(
      'Expected `bulletOrdered` (`' +
        bulletOrdered +
        '`) and `bulletOrderedOther` (`' +
        bulletOrderedOther +
        '`) to be different'
    )
  }

  return bulletOrderedOther
}
