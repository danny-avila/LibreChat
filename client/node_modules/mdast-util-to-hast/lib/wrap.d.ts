/**
 * @typedef {import('hast').Content} Content
 * @typedef {import('hast').Text} Text
 */
/**
 * Wrap `nodes` with line endings between each node.
 *
 * @template {Content} Type
 *   Node type.
 * @param {Array<Type>} nodes
 *   List of nodes to wrap.
 * @param {boolean | null | undefined} [loose=false]
 *   Whether to add line endings at start and end.
 * @returns {Array<Type | Text>}
 *   Wrapped nodes.
 */
export function wrap<Type extends import('hast').Content>(
  nodes: Type[],
  loose?: boolean | null | undefined
): (import('hast').Text | Type)[]
export type Content = import('hast').Content
export type Text = import('hast').Text
