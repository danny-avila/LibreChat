/**
 * @typedef {import('mdast').PhrasingContent} PhrasingContent
 * @typedef {import('unist-util-is').AssertPredicate<PhrasingContent>} AssertPredicatePhrasing
 */

import {convert} from 'unist-util-is'

/**
 * Check if the given value is *phrasing content*.
 *
 * @param
 *   Thing to check, typically `Node`.
 * @returns
 *   Whether `value` is phrasing content.
 */
export const phrasing = /** @type {AssertPredicatePhrasing} */ (
  convert([
    'break',
    'delete',
    'emphasis',
    'footnote',
    'footnoteReference',
    'image',
    'imageReference',
    'inlineCode',
    'link',
    'linkReference',
    'strong',
    'text'
  ])
)
