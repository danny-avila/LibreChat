/**
 * Find definitions in `tree`.
 *
 * Uses CommonMark precedence, which means that earlier definitions are
 * preferred over duplicate later definitions.
 *
 * @param {Node} tree
 *   Tree to check.
 * @returns {GetDefinition}
 *   Getter.
 */
export function definitions(tree: Node): GetDefinition
export type Root = import('mdast').Root
export type Content = import('mdast').Content
export type Definition = import('mdast').Definition
export type Node = Root | Content
/**
 * Get a definition by identifier.
 */
export type GetDefinition = (
  identifier?: string | null | undefined
) => Definition | null
