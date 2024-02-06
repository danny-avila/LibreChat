/**
 * Create an extension for `mdast-util-from-markdown`.
 *
 * @returns {FromMarkdownExtension}
 *   Extension for `mdast-util-from-markdown`.
 */
export function mathFromMarkdown(): FromMarkdownExtension
/**
 * Create an extension for `mdast-util-to-markdown`.
 *
 * @param {ToOptions | null | undefined} [options]
 *   Configuration.
 * @returns {ToMarkdownExtension}
 *   Extension for `mdast-util-to-markdown`.
 */
export function mathToMarkdown(
  options?: ToOptions | null | undefined
): ToMarkdownExtension
export type CompileContext = import('mdast-util-from-markdown').CompileContext
export type FromMarkdownExtension = import('mdast-util-from-markdown').Extension
export type FromMarkdownHandle = import('mdast-util-from-markdown').Handle
export type ToMarkdownExtension = import('mdast-util-to-markdown').Options
export type ToMarkdownHandle = import('mdast-util-to-markdown').Handle
export type Math = import('../index.js').Math
export type InlineMath = import('../index.js').InlineMath
/**
 * Configuration.
 */
export type ToOptions = {
  /**
   * Whether to support math (text) with a single dollar.
   *
   * Single dollars work in Pandoc and many other places, but often interfere
   * with “normal” dollars in text.
   * If you turn this off, you can still use two or more dollars for text math.
   */
  singleDollarTextMath?: boolean | null | undefined
}
