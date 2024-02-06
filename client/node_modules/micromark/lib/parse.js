/**
 * @typedef {import('micromark-util-types').Create} Create
 * @typedef {import('micromark-util-types').FullNormalizedExtension} FullNormalizedExtension
 * @typedef {import('micromark-util-types').InitialConstruct} InitialConstruct
 * @typedef {import('micromark-util-types').ParseContext} ParseContext
 * @typedef {import('micromark-util-types').ParseOptions} ParseOptions
 */

import {combineExtensions} from 'micromark-util-combine-extensions'
import {content} from './initialize/content.js'
import {document} from './initialize/document.js'
import {flow} from './initialize/flow.js'
import {text, string} from './initialize/text.js'
import {createTokenizer} from './create-tokenizer.js'
import * as defaultConstructs from './constructs.js'

/**
 * @param {ParseOptions | null | undefined} [options]
 * @returns {ParseContext}
 */
export function parse(options) {
  const settings = options || {}
  const constructs =
    /** @type {FullNormalizedExtension} */
    combineExtensions([defaultConstructs, ...(settings.extensions || [])])

  /** @type {ParseContext} */
  const parser = {
    defined: [],
    lazy: {},
    constructs,
    content: create(content),
    document: create(document),
    flow: create(flow),
    string: create(string),
    text: create(text)
  }
  return parser

  /**
   * @param {InitialConstruct} initial
   */
  function create(initial) {
    return creator
    /** @type {Create} */
    function creator(from) {
      return createTokenizer(parser, initial, from)
    }
  }
}
