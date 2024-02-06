/**
 * @typedef {import('micromark-util-types').Encoding} Encoding
 * @typedef {import('micromark-util-types').Options} Options
 * @typedef {import('micromark-util-types').Value} Value
 */

import {compile} from './lib/compile.js'
import {parse} from './lib/parse.js'
import {postprocess} from './lib/postprocess.js'
import {preprocess} from './lib/preprocess.js'

/**
 * Compile markdown to HTML.
 *
 * @overload
 * @param {Value} value
 *   Markdown to parse (`string` or `Buffer`).
 * @param {Encoding | null | undefined} encoding
 *   Character encoding to understand `value` as when it’s a `Buffer`
 *   (`string`, default: `'utf8'`).
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {string}
 *   Compiled HTML.
 *
 * @overload
 * @param {Value} value
 *   Markdown to parse (`string` or `Buffer`).
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {string}
 *   Compiled HTML.
 *
 * @param {Value} value
 *   Markdown to parse (`string` or `Buffer`).
 * @param {Options | Encoding | null | undefined} [encoding]
 *   Character encoding to understand `value` as when it’s a `Buffer`
 *   (`string`, default: `'utf8'`).
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {string}
 *   Compiled HTML.
 */
export function micromark(value, encoding, options) {
  if (typeof encoding !== 'string') {
    options = encoding
    encoding = undefined
  }

  return compile(options)(
    postprocess(
      parse(options).document().write(preprocess()(value, encoding, true))
    )
  )
}
