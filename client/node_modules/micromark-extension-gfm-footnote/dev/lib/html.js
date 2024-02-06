/**
 * @typedef {import('micromark-util-types').HtmlExtension} HtmlExtension
 */

/**
 * @callback BackLabelTemplate
 *   Generate a back label dynamically.
 *
 *   For the following markdown:
 *
 *   ```markdown
 *   Alpha[^micromark], bravo[^micromark], and charlie[^remark].
 *
 *   [^remark]: things about remark
 *   [^micromark]: things about micromark
 *   ```
 *
 *   This function will be called with:
 *
 *   * `0` and `0` for the backreference from `things about micromark` to
 *      `alpha`, as it is the first used definition, and the first call to it
 *   * `0` and `1` for the backreference from `things about micromark` to
 *      `bravo`, as it is the first used definition, and the second call to it
 *   * `1` and `0` for the backreference from `things about remark` to
 *      `charlie`, as it is the second used definition
 * @param {number} referenceIndex
 *   Index of the definition in the order that they are first referenced,
 *   0-indexed.
 * @param {number} rereferenceIndex
 *   Index of calls to the same definition, 0-indexed.
 * @returns {string}
 *   Back label to use when linking back from definitions to their reference.
 */

/**
 * @typedef Options
 *   Configuration.
 * @property {string} [clobberPrefix='user-content-']
 *   Prefix to use before the `id` attribute on footnotes to prevent them from
 *   *clobbering*.
 *
 *   The default is `'user-content-'`.
 *   Pass `''` for trusted markdown and when you are careful with
 *   polyfilling.
 *   You could pass a different prefix.
 *
 *   DOM clobbering is this:
 *
 *   ```html
 *   <p id="x"></p>
 *   <script>alert(x) // `x` now refers to the `p#x` DOM element</script>
 *   ```
 *
 *   The above example shows that elements are made available by browsers, by
 *   their ID, on the `window` object.
 *   This is a security risk because you might be expecting some other variable
 *   at that place.
 *   It can also break polyfills.
 *   Using a prefix solves these problems.
 * @property {string} [label='Footnotes']
 *   Textual label to use for the footnotes section.
 *
 *   The default value is `'Footnotes'`.
 *   Change it when the markdown is not in English.
 *
 *   This label is typically hidden visually (assuming a `sr-only` CSS class
 *   is defined that does that) and so affects screen readers only.
 *   If you do have such a class, but want to show this section to everyone,
 *   pass different attributes with the `labelAttributes` option.
 * @property {string} [labelAttributes='class="sr-only"']
 *   Attributes to use on the footnote label.
 *
 *   Change it to show the label and add other attributes.
 *
 *   This label is typically hidden visually (assuming an `sr-only` CSS class
 *   is defined that does that) and so affects screen readers only.
 *   If you do have such a class, but want to show this section to everyone,
 *   pass an empty string.
 *   You can also add different attributes.
 *
 *   > 👉 **Note**: `id="footnote-label"` is always added, because footnote
 *   > calls use it with `aria-describedby` to provide an accessible label.
 * @property {string} [labelTagName='h2']
 *   HTML tag name to use for the footnote label element.
 *
 *   Change it to match your document structure.
 *
 *   This label is typically hidden visually (assuming a `sr-only` CSS class
 *   is defined that does that) and so affects screen readers only.
 *   If you do have such a class, but want to show this section to everyone,
 *   pass different attributes with the `labelAttributes` option.
 * @property {BackLabelTemplate | string} [backLabel]
 *   Textual label to describe the backreference back to references.
 *
 *   The default value is:
 *
 *   ```js
 *   function defaultBackLabel(referenceIndex, rereferenceIndex) {
 *    return (
 *      'Back to reference ' +
 *      (referenceIndex + 1) +
 *      (rereferenceIndex > 1 ? '-' + rereferenceIndex : '')
 *    )
 *  }
 *   ```
 *
 *   Change it when the markdown is not in English.
 *
 *   This label is used in the `aria-label` attribute on each backreference
 *   (the `↩` links).
 *   It affects users of assistive technology.
 */

import {ok as assert} from 'uvu/assert'
import {normalizeIdentifier} from 'micromark-util-normalize-identifier'
import {sanitizeUri} from 'micromark-util-sanitize-uri'

const own = {}.hasOwnProperty

/** @type {Options} */
const emptyOptions = {}

/**
 * Generate the default label that GitHub uses on backreferences.
 *
 * @param {number} referenceIndex
 *   Index of the definition in the order that they are first referenced,
 *   0-indexed.
 * @param {number} rereferenceIndex
 *   Index of calls to the same definition, 0-indexed.
 * @returns {string}
 *   Default label.
 */
export function defaultBackLabel(referenceIndex, rereferenceIndex) {
  return (
    'Back to reference ' +
    (referenceIndex + 1) +
    (rereferenceIndex > 1 ? '-' + rereferenceIndex : '')
  )
}

/**
 * Create an extension for `micromark` to support GFM footnotes when
 * serializing to HTML.
 *
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {HtmlExtension}
 *   Extension for `micromark` that can be passed in `htmlExtensions` to
 *   support GFM footnotes when serializing to HTML.
 */
export function gfmFootnoteHtml(options) {
  const config = options || emptyOptions
  const label = config.label || 'Footnotes'
  const labelTagName = config.labelTagName || 'h2'
  const labelAttributes =
    config.labelAttributes === null || config.labelAttributes === undefined
      ? 'class="sr-only"'
      : config.labelAttributes
  const backLabel = config.backLabel || defaultBackLabel
  const clobberPrefix =
    config.clobberPrefix === null || config.clobberPrefix === undefined
      ? 'user-content-'
      : config.clobberPrefix
  return {
    enter: {
      gfmFootnoteDefinition() {
        const stack = this.getData('tightStack')
        stack.push(false)
      },
      gfmFootnoteDefinitionLabelString() {
        this.buffer()
      },
      gfmFootnoteCallString() {
        this.buffer()
      }
    },
    exit: {
      gfmFootnoteDefinition() {
        let definitions = this.getData('gfmFootnoteDefinitions')
        const footnoteStack = this.getData('gfmFootnoteDefinitionStack')
        assert(footnoteStack, 'expected `footnoteStack`')
        const tightStack = this.getData('tightStack')
        const current = footnoteStack.pop()
        const value = this.resume()

        assert(current, 'expected to be in a footnote')

        if (!definitions) {
          this.setData('gfmFootnoteDefinitions', (definitions = {}))
        }

        if (!own.call(definitions, current)) definitions[current] = value

        tightStack.pop()
        this.setData('slurpOneLineEnding', true)
        // “Hack” to prevent a line ending from showing up if we’re in a definition in
        // an empty list item.
        this.setData('lastWasTag')
      },
      gfmFootnoteDefinitionLabelString(token) {
        let footnoteStack = /** @type {Array<string>} */ (
          this.getData('gfmFootnoteDefinitionStack')
        )

        if (!footnoteStack) {
          this.setData('gfmFootnoteDefinitionStack', (footnoteStack = []))
        }

        footnoteStack.push(normalizeIdentifier(this.sliceSerialize(token)))
        this.resume() // Drop the label.
        this.buffer() // Get ready for a value.
      },
      gfmFootnoteCallString(token) {
        let calls = this.getData('gfmFootnoteCallOrder')
        let counts = this.getData('gfmFootnoteCallCounts')
        const id = normalizeIdentifier(this.sliceSerialize(token))
        /** @type {number} */
        let counter

        this.resume()

        if (!calls) this.setData('gfmFootnoteCallOrder', (calls = []))
        if (!counts) this.setData('gfmFootnoteCallCounts', (counts = {}))

        const index = calls.indexOf(id)
        const safeId = sanitizeUri(id.toLowerCase())

        if (index === -1) {
          calls.push(id)
          counts[id] = 1
          counter = calls.length
        } else {
          counts[id]++
          counter = index + 1
        }

        const reuseCounter = counts[id]

        this.tag(
          '<sup><a href="#' +
            clobberPrefix +
            'fn-' +
            safeId +
            '" id="' +
            clobberPrefix +
            'fnref-' +
            safeId +
            (reuseCounter > 1 ? '-' + reuseCounter : '') +
            '" data-footnote-ref="" aria-describedby="footnote-label">' +
            String(counter) +
            '</a></sup>'
        )
      },
      null() {
        const calls = /** @type {Array<string>} */ (
          this.getData('gfmFootnoteCallOrder') || []
        )
        const counts = /** @type {Record<string, number>} */ (
          this.getData('gfmFootnoteCallCounts') || {}
        )
        const definitions = /** @type {Record<string, string>} */ (
          this.getData('gfmFootnoteDefinitions') || {}
        )
        let index = -1

        if (calls.length > 0) {
          this.lineEndingIfNeeded()
          this.tag(
            '<section data-footnotes="" class="footnotes"><' +
              labelTagName +
              ' id="footnote-label"' +
              (labelAttributes ? ' ' + labelAttributes : '') +
              '>'
          )
          this.raw(this.encode(label))
          this.tag('</' + labelTagName + '>')
          this.lineEndingIfNeeded()
          this.tag('<ol>')
        }

        while (++index < calls.length) {
          // Called definitions are always defined.
          const id = calls[index]
          const safeId = sanitizeUri(id.toLowerCase())
          let referenceIndex = 0
          /** @type {Array<string>} */
          const references = []

          while (++referenceIndex <= counts[id]) {
            references.push(
              '<a href="#' +
                clobberPrefix +
                'fnref-' +
                safeId +
                (referenceIndex > 1 ? '-' + referenceIndex : '') +
                '" data-footnote-backref="" aria-label="' +
                this.encode(
                  typeof backLabel === 'string'
                    ? backLabel
                    : backLabel(index, referenceIndex)
                ) +
                '" class="data-footnote-backref">↩' +
                (referenceIndex > 1
                  ? '<sup>' + referenceIndex + '</sup>'
                  : '') +
                '</a>'
            )
          }

          const reference = references.join(' ')
          let injected = false

          this.lineEndingIfNeeded()
          this.tag('<li id="' + clobberPrefix + 'fn-' + safeId + '">')
          this.lineEndingIfNeeded()
          this.tag(
            definitions[id].replace(
              /<\/p>(?:\r?\n|\r)?$/,
              (/** @type {string} */ $0) => {
                injected = true
                return ' ' + reference + $0
              }
            )
          )

          if (!injected) {
            this.lineEndingIfNeeded()
            this.tag(reference)
          }

          this.lineEndingIfNeeded()
          this.tag('</li>')
        }

        if (calls.length > 0) {
          this.lineEndingIfNeeded()
          this.tag('</ol>')
          this.lineEndingIfNeeded()
          this.tag('</section>')
        }
      }
    }
  }
}
