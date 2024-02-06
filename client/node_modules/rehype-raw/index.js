/**
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast-util-raw').Options} Options
 * @typedef {import('hast-util-raw')} DoNotTouchAsThisImportIncludesRawInTree
 */

import {raw} from 'hast-util-raw'

/**
 * Plugin to parse the tree again (and raw nodes).
 * Keeping positional info OK.  🙌
 *
 * @type {import('unified').Plugin<[Options?] | Array<void>, Root>}
 */
export default function rehypeRaw(options = {}) {
  return (tree, file) => {
    // Assume that when a root was given, it’s also returned.
    const result = /** @type {Root} */ (raw(tree, file, options))
    return result
  }
}
