/**
 * Extension for `mdast-util-from-markdown` to enable GFM strikethrough.
 *
 * @type {FromMarkdownExtension}
 */
export const gfmStrikethroughFromMarkdown: FromMarkdownExtension
/**
 * Extension for `mdast-util-to-markdown` to enable GFM strikethrough.
 *
 * @type {ToMarkdownExtension}
 */
export const gfmStrikethroughToMarkdown: ToMarkdownExtension
export type Delete = import('mdast').Delete
export type CompileContext = import('mdast-util-from-markdown').CompileContext
export type FromMarkdownExtension = import('mdast-util-from-markdown').Extension
export type FromMarkdownHandle = import('mdast-util-from-markdown').Handle
export type ConstructName = import('mdast-util-to-markdown').ConstructName
export type ToMarkdownExtension = import('mdast-util-to-markdown').Options
export type ToMarkdownHandle = import('mdast-util-to-markdown').Handle
