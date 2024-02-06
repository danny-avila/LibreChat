/**
 * Extension for `mdast-util-from-markdown` to enable GFM autolink literals.
 *
 * @type {FromMarkdownExtension}
 */
export const gfmAutolinkLiteralFromMarkdown: FromMarkdownExtension
/**
 * Extension for `mdast-util-to-markdown` to enable GFM autolink literals.
 *
 * @type {ToMarkdownExtension}
 */
export const gfmAutolinkLiteralToMarkdown: ToMarkdownExtension
export type Link = import('mdast').Link
export type PhrasingContent = import('mdast').PhrasingContent
export type CompileContext = import('mdast-util-from-markdown').CompileContext
export type FromMarkdownExtension = import('mdast-util-from-markdown').Extension
export type FromMarkdownHandle = import('mdast-util-from-markdown').Handle
export type FromMarkdownTransform = import('mdast-util-from-markdown').Transform
export type ConstructName = import('mdast-util-to-markdown').ConstructName
export type ToMarkdownExtension = import('mdast-util-to-markdown').Options
export type ReplaceFunction =
  import('mdast-util-find-and-replace').ReplaceFunction
export type RegExpMatchObject =
  import('mdast-util-find-and-replace').RegExpMatchObject
