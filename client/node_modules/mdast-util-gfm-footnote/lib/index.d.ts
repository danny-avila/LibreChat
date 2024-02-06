/**
 * Create an extension for `mdast-util-from-markdown` to enable GFM footnotes
 * in markdown.
 *
 * @returns {FromMarkdownExtension}
 *   Extension for `mdast-util-from-markdown`.
 */
export function gfmFootnoteFromMarkdown(): FromMarkdownExtension
/**
 * Create an extension for `mdast-util-to-markdown` to enable GFM footnotes
 * in markdown.
 *
 * @returns {ToMarkdownExtension}
 *   Extension for `mdast-util-to-markdown`.
 */
export function gfmFootnoteToMarkdown(): ToMarkdownExtension
export type FootnoteReference = import('mdast').FootnoteReference
export type FootnoteDefinition = import('mdast').FootnoteDefinition
export type CompileContext = import('mdast-util-from-markdown').CompileContext
export type FromMarkdownExtension = import('mdast-util-from-markdown').Extension
export type FromMarkdownHandle = import('mdast-util-from-markdown').Handle
export type ToMarkdownExtension = import('mdast-util-to-markdown').Options
export type ToMarkdownHandle = import('mdast-util-to-markdown').Handle
export type Map = import('mdast-util-to-markdown').Map
