/**
 * Check if the given value is *phrasing content*.
 *
 * @param
 *   Thing to check, typically `Node`.
 * @returns
 *   Whether `node` is phrasing content.
 */
export const phrasing: AssertPredicatePhrasing
export type PhrasingContent = import('mdast').PhrasingContent
export type AssertPredicatePhrasing =
  import('unist-util-is').AssertPredicate<PhrasingContent>
