/**
 * Extension for `mdast-util-from-markdown` to enable GFM task list items.
 *
 * @type {FromMarkdownExtension}
 */
export const gfmTaskListItemFromMarkdown: FromMarkdownExtension
/**
 * Extension for `mdast-util-to-markdown` to enable GFM task list items.
 *
 * @type {ToMarkdownExtension}
 */
export const gfmTaskListItemToMarkdown: ToMarkdownExtension
export type Content = import('mdast').Content
export type ListItem = import('mdast').ListItem
export type Paragraph = import('mdast').Paragraph
export type Parent = import('mdast').Parent
export type Root = import('mdast').Root
export type CompileContext = import('mdast-util-from-markdown').CompileContext
export type FromMarkdownExtension = import('mdast-util-from-markdown').Extension
export type FromMarkdownHandle = import('mdast-util-from-markdown').Handle
export type ToMarkdownExtension = import('mdast-util-to-markdown').Options
export type ToMarkdownHandle = import('mdast-util-to-markdown').Handle
export type Parents = Extract<Root | Content, Parent>
