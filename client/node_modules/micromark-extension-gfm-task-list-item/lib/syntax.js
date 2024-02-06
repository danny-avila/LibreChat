/**
 * @typedef {import('micromark-util-types').Extension} Extension
 * @typedef {import('micromark-util-types').State} State
 * @typedef {import('micromark-util-types').TokenizeContext} TokenizeContext
 * @typedef {import('micromark-util-types').Tokenizer} Tokenizer
 */

import {factorySpace} from 'micromark-factory-space'
import {
  markdownLineEndingOrSpace,
  markdownLineEnding,
  markdownSpace
} from 'micromark-util-character'
const tasklistCheck = {
  tokenize: tokenizeTasklistCheck
}

// To do: next major: expose function to make extension.

/**
 * Extension for `micromark` that can be passed in `extensions`, to
 * enable GFM task list items syntax.
 *
 * @type {Extension}
 */
export const gfmTaskListItem = {
  text: {
    [91]: tasklistCheck
  }
}

/**
 * @this {TokenizeContext}
 * @type {Tokenizer}
 */
function tokenizeTasklistCheck(effects, ok, nok) {
  const self = this
  return open

  /**
   * At start of task list item check.
   *
   * ```markdown
   * > | * [x] y.
   *       ^
   * ```
   *
   * @type {State}
   */
  function open(code) {
    if (
      // Exit if there’s stuff before.
      self.previous !== null ||
      // Exit if not in the first content that is the first child of a list
      // item.
      !self._gfmTasklistFirstContentOfListItem
    ) {
      return nok(code)
    }
    effects.enter('taskListCheck')
    effects.enter('taskListCheckMarker')
    effects.consume(code)
    effects.exit('taskListCheckMarker')
    return inside
  }

  /**
   * In task list item check.
   *
   * ```markdown
   * > | * [x] y.
   *        ^
   * ```
   *
   * @type {State}
   */
  function inside(code) {
    // Currently we match how GH works in files.
    // To match how GH works in comments, use `markdownSpace` (`[\t ]`) instead
    // of `markdownLineEndingOrSpace` (`[\t\n\r ]`).
    if (markdownLineEndingOrSpace(code)) {
      effects.enter('taskListCheckValueUnchecked')
      effects.consume(code)
      effects.exit('taskListCheckValueUnchecked')
      return close
    }
    if (code === 88 || code === 120) {
      effects.enter('taskListCheckValueChecked')
      effects.consume(code)
      effects.exit('taskListCheckValueChecked')
      return close
    }
    return nok(code)
  }

  /**
   * At close of task list item check.
   *
   * ```markdown
   * > | * [x] y.
   *         ^
   * ```
   *
   * @type {State}
   */
  function close(code) {
    if (code === 93) {
      effects.enter('taskListCheckMarker')
      effects.consume(code)
      effects.exit('taskListCheckMarker')
      effects.exit('taskListCheck')
      return after
    }
    return nok(code)
  }

  /**
   * @type {State}
   */
  function after(code) {
    // EOL in paragraph means there must be something else after it.
    if (markdownLineEnding(code)) {
      return ok(code)
    }

    // Space or tab?
    // Check what comes after.
    if (markdownSpace(code)) {
      return effects.check(
        {
          tokenize: spaceThenNonSpace
        },
        ok,
        nok
      )(code)
    }

    // EOF, or non-whitespace, both wrong.
    return nok(code)
  }
}

/**
 * @this {TokenizeContext}
 * @type {Tokenizer}
 */
function spaceThenNonSpace(effects, ok, nok) {
  return factorySpace(effects, after, 'whitespace')

  /**
   * After whitespace, after task list item check.
   *
   * ```markdown
   * > | * [x] y.
   *           ^
   * ```
   *
   * @type {State}
   */
  function after(code) {
    // EOF means there was nothing, so bad.
    // EOL means there’s content after it, so good.
    // Impossible to have more spaces.
    // Anything else is good.
    return code === null ? nok(code) : ok(code)
  }
}
