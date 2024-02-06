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
export function defaultBackLabel(
  referenceIndex: number,
  rereferenceIndex: number
): string
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
export function gfmFootnoteHtml(
  options?: Options | null | undefined
): HtmlExtension
export type HtmlExtension = import('micromark-util-types').HtmlExtension
/**
 * Generate a back label dynamically.
 *
 * For the following markdown:
 *
 * ```markdown
 * Alpha[^micromark], bravo[^micromark], and charlie[^remark].
 *
 * [^remark]: things about remark
 * [^micromark]: things about micromark
 * ```
 *
 * This function will be called with:
 *
 * * `0` and `0` for the backreference from `things about micromark` to
 *  `alpha`, as it is the first used definition, and the first call to it
 * * `0` and `1` for the backreference from `things about micromark` to
 *  `bravo`, as it is the first used definition, and the second call to it
 * * `1` and `0` for the backreference from `things about remark` to
 *  `charlie`, as it is the second used definition
 */
export type BackLabelTemplate = (
  referenceIndex: number,
  rereferenceIndex: number
) => string
/**
 * Configuration.
 */
export type Options = {
  /**
   * Prefix to use before the `id` attribute on footnotes to prevent them from
   * *clobbering*.
   *
   * The default is `'user-content-'`.
   * Pass `''` for trusted markdown and when you are careful with
   * polyfilling.
   * You could pass a different prefix.
   *
   * DOM clobbering is this:
   *
   * ```html
   * <p id="x"></p>
   * <script>alert(x) // `x` now refers to the `p#x` DOM element</script>
   * ```
   *
   * The above example shows that elements are made available by browsers, by
   * their ID, on the `window` object.
   * This is a security risk because you might be expecting some other variable
   * at that place.
   * It can also break polyfills.
   * Using a prefix solves these problems.
   */
  clobberPrefix?: string
  /**
   * Textual label to use for the footnotes section.
   *
   * The default value is `'Footnotes'`.
   * Change it when the markdown is not in English.
   *
   * This label is typically hidden visually (assuming a `sr-only` CSS class
   * is defined that does that) and so affects screen readers only.
   * If you do have such a class, but want to show this section to everyone,
   * pass different attributes with the `labelAttributes` option.
   */
  label?: string
  /**
   * Attributes to use on the footnote label.
   *
   * Change it to show the label and add other attributes.
   *
   * This label is typically hidden visually (assuming an `sr-only` CSS class
   * is defined that does that) and so affects screen readers only.
   * If you do have such a class, but want to show this section to everyone,
   * pass an empty string.
   * You can also add different attributes.
   *
   * > 👉 **Note**: `id="footnote-label"` is always added, because footnote
   * > calls use it with `aria-describedby` to provide an accessible label.
   */
  labelAttributes?: string
  /**
   * HTML tag name to use for the footnote label element.
   *
   * Change it to match your document structure.
   *
   * This label is typically hidden visually (assuming a `sr-only` CSS class
   * is defined that does that) and so affects screen readers only.
   * If you do have such a class, but want to show this section to everyone,
   * pass different attributes with the `labelAttributes` option.
   */
  labelTagName?: string
  /**
   * Textual label to describe the backreference back to references.
   *
   * The default value is:
   *
   * ```js
   * function defaultBackLabel(referenceIndex, rereferenceIndex) {
   * return (
   * 'Back to reference ' +
   * (referenceIndex + 1) +
   * (rereferenceIndex > 1 ? '-' + rereferenceIndex : '')
   * )
   * }
   * ```
   *
   * Change it when the markdown is not in English.
   *
   * This label is used in the `aria-label` attribute on each backreference
   * (the `↩` links).
   * It affects users of assistive technology.
   */
  backLabel?: BackLabelTemplate | string
}
