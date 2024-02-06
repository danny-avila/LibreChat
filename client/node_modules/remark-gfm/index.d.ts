/**
 * Plugin to support GFM (autolink literals, footnotes, strikethrough, tables, tasklists).
 *
 * @type {import('unified').Plugin<[Options?]|void[], Root>}
 */
export default function remarkGfm(
  options?: void | Options | undefined
):
  | void
  | import('unified').Transformer<import('mdast').Root, import('mdast').Root>
export type Root = import('mdast').Root
export type Options = import('micromark-extension-gfm').Options &
  import('mdast-util-gfm').Options
