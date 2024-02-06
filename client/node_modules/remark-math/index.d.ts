/**
 * Plugin to support math.
 *
 * @type {import('unified').Plugin<[Options?] | void[], Root, Root>}
 */
export default function remarkMath(
  options?: void | import('mdast-util-math').ToOptions | undefined
):
  | void
  | import('unified').Transformer<import('mdast').Root, import('mdast').Root>
export type Root = import('mdast').Root
export type Options = import('mdast-util-math').ToOptions
export type DoNotTouchAsThisImportIncludesMathInTree =
  typeof import('mdast-util-math')
