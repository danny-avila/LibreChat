export default remarkRehype
export type HastRoot = import('hast').Root
export type MdastRoot = import('mdast').Root
export type Options = import('mdast-util-to-hast').Options
export type Processor = import('unified').Processor<any, any, any, any>
export type DoNotTouchAsThisImportIncludesRawInTree =
  typeof import('mdast-util-to-hast')
/**
 * Plugin that turns markdown into HTML to support rehype.
 *
 * *   If a destination processor is given, that processor runs with a new HTML
 *     (hast) tree (bridge-mode).
 *     As the given processor runs with a hast tree, and rehype plugins support
 *     hast, that means rehype plugins can be used with the given processor.
 *     The hast tree is discarded in the end.
 *     It’s highly unlikely that you want to do this.
 * *   The common case is to not pass a destination processor, in which case the
 *     current processor continues running with a new HTML (hast) tree
 *     (mutate-mode).
 *     As the current processor continues with a hast tree, and rehype plugins
 *     support hast, that means rehype plugins can be used after
 *     `remark-rehype`.
 *     It’s likely that this is what you want to do.
 *
 * @param destination
 *   Optional unified processor.
 * @param options
 *   Options passed to `mdast-util-to-hast`.
 */
declare const remarkRehype: import('unified').Plugin<
  | [
      import('unified').Processor<any, any, any, any>,
      (import('mdast-util-to-hast/lib').Options | undefined)?
    ]
  | [null | undefined, (import('mdast-util-to-hast/lib').Options | undefined)?]
  | [import('mdast-util-to-hast/lib').Options]
  | [],
  import('mdast').Root,
  import('mdast').Root
>
