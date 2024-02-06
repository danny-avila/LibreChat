/**
 * @typedef {import('micromark-util-types').CompileContext} CompileContext
 * @typedef {import('micromark-util-types').Handle} Handle
 * @typedef {import('micromark-util-types').HtmlExtension} HtmlExtension
 * @typedef {import('micromark-util-types').Token} Token
 */

import {sanitizeUri} from 'micromark-util-sanitize-uri'

// To do: next major: expose functions that yields extension.

/**
 * Extension for `micromark` that can be passed in `htmlExtensions` to support
 * GFM autolink literals when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmAutolinkLiteralHtml = {
  exit: {literalAutolinkEmail, literalAutolinkHttp, literalAutolinkWww}
}

/**
 * @this {CompileContext}
 * @type {Handle}
 */
function literalAutolinkWww(token) {
  anchorFromToken.call(this, token, 'http://')
}

/**
 * @this {CompileContext}
 * @type {Handle}
 */
function literalAutolinkEmail(token) {
  anchorFromToken.call(this, token, 'mailto:')
}

/**
 * @this {CompileContext}
 * @type {Handle}
 */
function literalAutolinkHttp(token) {
  anchorFromToken.call(this, token)
}

/**
 * @this CompileContext
 * @param {Token} token
 * @param {string | null | undefined} [protocol]
 * @returns {void}
 */
function anchorFromToken(token, protocol) {
  const url = this.sliceSerialize(token)
  this.tag('<a href="' + sanitizeUri((protocol || '') + url) + '">')
  this.raw(this.encode(url))
  this.tag('</a>')
}
