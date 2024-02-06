/**
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Options} Options
 */

/**
 * @param {State} state
 * @returns {Exclude<Options['strong'], null | undefined>}
 */
export function checkStrong(state) {
  const marker = state.options.strong || '*'

  if (marker !== '*' && marker !== '_') {
    throw new Error(
      'Cannot serialize strong with `' +
        marker +
        '` for `options.strong`, expected `*`, or `_`'
    )
  }

  return marker
}
