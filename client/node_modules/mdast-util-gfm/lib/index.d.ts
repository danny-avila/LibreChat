/**
 * Create an extension for `mdast-util-from-markdown` to enable GFM (autolink
 * literals, footnotes, strikethrough, tables, tasklists).
 *
 * @returns {Array<FromMarkdownExtension>}
 *   Extension for `mdast-util-from-markdown` to enable GFM (autolink literals,
 *   footnotes, strikethrough, tables, tasklists).
 */
export function gfmFromMarkdown(): Array<FromMarkdownExtension>
/**
 * Create an extension for `mdast-util-to-markdown` to enable GFM (autolink
 * literals, footnotes, strikethrough, tables, tasklists).
 *
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {ToMarkdownExtension}
 *   Extension for `mdast-util-to-markdown` to enable GFM (autolink literals,
 *   footnotes, strikethrough, tables, tasklists).
 */
export function gfmToMarkdown(
  options?: Options | null | undefined
): ToMarkdownExtension
export type FromMarkdownExtension = import('mdast-util-from-markdown').Extension
export type ToMarkdownExtension = import('mdast-util-to-markdown').Options
/**
 * Configuration.
 */
export type Options = import('mdast-util-gfm-table').Options
