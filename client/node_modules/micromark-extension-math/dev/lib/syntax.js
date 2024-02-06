/**
 * @typedef {import('micromark-util-types').Extension} Extension
 * @typedef {import('./math-text.js').Options} Options
 */

import {codes} from 'micromark-util-symbol/codes.js'
import {mathFlow} from './math-flow.js'
import {mathText} from './math-text.js'

/**
 * Create an extension for `micromark` to enable math syntax.
 *
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions`, to
 *   enable math syntax.
 */
export function math(options) {
  return {
    flow: {[codes.dollarSign]: mathFlow},
    text: {[codes.dollarSign]: mathText(options)}
  }
}
