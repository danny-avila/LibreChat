/**
 * @typedef {import('mdast').Code} Code
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Info} Info
 * @typedef {import('../types.js').Map} Map
 */

import {longestStreak} from 'longest-streak'
import {formatCodeAsIndented} from '../util/format-code-as-indented.js'
import {checkFence} from '../util/check-fence.js'

/**
 * @param {Code} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function code(node, _, state, info) {
  const marker = checkFence(state)
  const raw = node.value || ''
  const suffix = marker === '`' ? 'GraveAccent' : 'Tilde'

  if (formatCodeAsIndented(node, state)) {
    const exit = state.enter('codeIndented')
    const value = state.indentLines(raw, map)
    exit()
    return value
  }

  const tracker = state.createTracker(info)
  const sequence = marker.repeat(Math.max(longestStreak(raw, marker) + 1, 3))
  const exit = state.enter('codeFenced')
  let value = tracker.move(sequence)

  if (node.lang) {
    const subexit = state.enter(`codeFencedLang${suffix}`)
    value += tracker.move(
      state.safe(node.lang, {
        before: value,
        after: ' ',
        encode: ['`'],
        ...tracker.current()
      })
    )
    subexit()
  }

  if (node.lang && node.meta) {
    const subexit = state.enter(`codeFencedMeta${suffix}`)
    value += tracker.move(' ')
    value += tracker.move(
      state.safe(node.meta, {
        before: value,
        after: '\n',
        encode: ['`'],
        ...tracker.current()
      })
    )
    subexit()
  }

  value += tracker.move('\n')

  if (raw) {
    value += tracker.move(raw + '\n')
  }

  value += tracker.move(sequence)
  exit()
  return value
}

/** @type {Map} */
function map(line, _, blank) {
  return (blank ? '' : '    ') + line
}
