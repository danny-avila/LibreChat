/**
 * @typedef {import('mdast-util-from-markdown').CompileContext} CompileContext
 * @typedef {import('mdast-util-from-markdown').Extension} FromMarkdownExtension
 * @typedef {import('mdast-util-from-markdown').Handle} FromMarkdownHandle
 * @typedef {import('mdast-util-to-markdown').Options} ToMarkdownExtension
 * @typedef {import('mdast-util-to-markdown').Handle} ToMarkdownHandle
 * @typedef {import('../index.js').Math} Math
 * @typedef {import('../index.js').InlineMath} InlineMath
 *
 * @typedef ToOptions
 *   Configuration.
 * @property {boolean | null | undefined} [singleDollarTextMath=true]
 *   Whether to support math (text) with a single dollar.
 *
 *   Single dollars work in Pandoc and many other places, but often interfere
 *   with “normal” dollars in text.
 *   If you turn this off, you can still use two or more dollars for text math.
 */

import {longestStreak} from 'longest-streak'
import {safe} from 'mdast-util-to-markdown/lib/util/safe.js'
import {track} from 'mdast-util-to-markdown/lib/util/track.js'
import {patternCompile} from 'mdast-util-to-markdown/lib/util/pattern-compile.js'

/**
 * Create an extension for `mdast-util-from-markdown`.
 *
 * @returns {FromMarkdownExtension}
 *   Extension for `mdast-util-from-markdown`.
 */
export function mathFromMarkdown() {
  return {
    enter: {
      mathFlow: enterMathFlow,
      mathFlowFenceMeta: enterMathFlowMeta,
      mathText: enterMathText
    },
    exit: {
      mathFlow: exitMathFlow,
      mathFlowFence: exitMathFlowFence,
      mathFlowFenceMeta: exitMathFlowMeta,
      mathFlowValue: exitMathData,
      mathText: exitMathText,
      mathTextData: exitMathData
    }
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function enterMathFlow(token) {
    this.enter(
      {
        type: 'math',
        meta: null,
        value: '',
        data: {
          hName: 'div',
          hProperties: {className: ['math', 'math-display']},
          hChildren: [{type: 'text', value: ''}]
        }
      },
      token
    )
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function enterMathFlowMeta() {
    this.buffer()
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathFlowMeta() {
    const data = this.resume()
    const node = /** @type {Math} */ (this.stack[this.stack.length - 1])
    node.meta = data
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathFlowFence() {
    // Exit if this is the closing fence.
    if (this.getData('mathFlowInside')) return
    this.buffer()
    this.setData('mathFlowInside', true)
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathFlow(token) {
    const data = this.resume().replace(/^(\r?\n|\r)|(\r?\n|\r)$/g, '')
    const node = /** @type {Math} */ (this.exit(token))
    node.value = data
    // @ts-expect-error: we defined it.
    node.data.hChildren[0].value = data
    this.setData('mathFlowInside')
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function enterMathText(token) {
    this.enter(
      {
        type: 'inlineMath',
        value: '',
        data: {
          hName: 'span',
          hProperties: {className: ['math', 'math-inline']},
          hChildren: [{type: 'text', value: ''}]
        }
      },
      token
    )
    this.buffer()
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathText(token) {
    const data = this.resume()
    const node = /** @type {Math} */ (this.exit(token))
    node.value = data
    // @ts-expect-error: we defined it.
    node.data.hChildren[0].value = data
  }

  /**
   * @this {CompileContext}
   * @type {FromMarkdownHandle}
   */
  function exitMathData(token) {
    this.config.enter.data.call(this, token)
    this.config.exit.data.call(this, token)
  }
}

/**
 * Create an extension for `mdast-util-to-markdown`.
 *
 * @param {ToOptions | null | undefined} [options]
 *   Configuration.
 * @returns {ToMarkdownExtension}
 *   Extension for `mdast-util-to-markdown`.
 */
export function mathToMarkdown(options) {
  let single = (options || {}).singleDollarTextMath

  if (single === null || single === undefined) {
    single = true
  }

  inlineMath.peek = inlineMathPeek

  return {
    unsafe: [
      {character: '\r', inConstruct: 'mathFlowMeta'},
      {character: '\n', inConstruct: 'mathFlowMeta'},
      {
        character: '$',
        after: single ? undefined : '\\$',
        inConstruct: 'phrasing'
      },
      {character: '$', inConstruct: 'mathFlowMeta'},
      {atBreak: true, character: '$', after: '\\$'}
    ],
    handlers: {math, inlineMath}
  }

  /**
   * @type {ToMarkdownHandle}
   * @param {Math} node
   */
  // To do: next major: rename `context` to state, `safeOptions` to info.
  // Note: fixing this code? Please also fix the similar code for code:
  // <https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/handle/code.js>
  function math(node, _, context, safeOptions) {
    const raw = node.value || ''
    const tracker = track(safeOptions)
    const sequence = '$'.repeat(Math.max(longestStreak(raw, '$') + 1, 2))
    const exit = context.enter('mathFlow')
    let value = tracker.move(sequence)

    if (node.meta) {
      const subexit = context.enter('mathFlowMeta')
      value += tracker.move(
        safe(context, node.meta, {
          before: value,
          after: '\n',
          encode: ['$'],
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

  /**
   * @type {ToMarkdownHandle}
   * @param {InlineMath} node
   */
  // Note: fixing this code? Please also fix the similar code for inline code:
  // <https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/handle/inline-code.js>
  //
  // To do: next major: rename `context` to state.
  // To do: next major: use `state` (`safe`, `track`, `patternCompile`).
  function inlineMath(node, _, context) {
    let value = node.value || ''
    let size = 1

    if (!single) size++

    // If there is a single dollar sign on its own in the math, use a fence of
    // two.
    // If there are two in a row, use one.
    while (
      new RegExp('(^|[^$])' + '\\$'.repeat(size) + '([^$]|$)').test(value)
    ) {
      size++
    }

    const sequence = '$'.repeat(size)

    // If this is not just spaces or eols (tabs don’t count), and either the
    // first and last character are a space or eol, or the first or last
    // character are dollar signs, then pad with spaces.
    if (
      // Contains non-space.
      /[^ \r\n]/.test(value) &&
      // Starts with space and ends with space.
      ((/^[ \r\n]/.test(value) && /[ \r\n]$/.test(value)) ||
        // Starts or ends with dollar.
        /^\$|\$$/.test(value))
    ) {
      value = ' ' + value + ' '
    }

    let index = -1

    // We have a potential problem: certain characters after eols could result in
    // blocks being seen.
    // For example, if someone injected the string `'\n# b'`, then that would
    // result in an ATX heading.
    // We can’t escape characters in `inlineMath`, but because eols are
    // transformed to spaces when going from markdown to HTML anyway, we can swap
    // them out.
    while (++index < context.unsafe.length) {
      const pattern = context.unsafe[index]
      const expression = patternCompile(pattern)
      /** @type {RegExpExecArray | null} */
      let match

      // Only look for `atBreak`s.
      // Btw: note that `atBreak` patterns will always start the regex at LF or
      // CR.
      if (!pattern.atBreak) continue

      while ((match = expression.exec(value))) {
        let position = match.index

        // Support CRLF (patterns only look for one of the characters).
        if (
          value.codePointAt(position) === 10 /* `\n` */ &&
          value.codePointAt(position - 1) === 13 /* `\r` */
        ) {
          position--
        }

        value = value.slice(0, position) + ' ' + value.slice(match.index + 1)
      }
    }

    return sequence + value + sequence
  }

  /**
   * @returns {string}
   */
  function inlineMathPeek() {
    return '$'
  }
}
