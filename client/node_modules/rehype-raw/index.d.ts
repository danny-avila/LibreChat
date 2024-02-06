/**
 * Plugin to parse the tree again (and raw nodes).
 * Keeping positional info OK.  🙌
 *
 * @type {import('unified').Plugin<[Options?] | Array<void>, Root>}
 */
export default function rehypeRaw(
  options?: void | import('hast-util-raw/lib').Options | undefined
):
  | void
  | import('unified').Transformer<import('hast').Root, import('hast').Root>
export type Root = import('hast').Root
export type Options = import('hast-util-raw').Options
export type DoNotTouchAsThisImportIncludesRawInTree =
  typeof import('hast-util-raw')
