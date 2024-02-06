/**
 * Transform an mdast node into a hast node.
 *
 * @param {State} state
 *   Info passed around.
 * @param {MdastNodes} node
 *   mdast node.
 * @param {MdastParents | null | undefined} [parent]
 *   Parent of `node`.
 * @returns {HastElementContent | Array<HastElementContent> | null | undefined}
 *   Resulting hast node.
 */
export function one(
  state: State,
  node: MdastNodes,
  parent?: MdastParents | null | undefined
): HastElementContent | Array<HastElementContent> | null | undefined
/**
 * Transform the children of an mdast node into hast nodes.
 *
 * @param {State} state
 *   Info passed around.
 * @param {MdastNodes} parent
 *   mdast node to compile
 * @returns {Array<HastElementContent>}
 *   Resulting hast nodes.
 */
export function all(state: State, parent: MdastNodes): Array<HastElementContent>
export type HastElementContent = import('hast').ElementContent
export type HastElement = import('hast').Element
export type HastText = import('hast').Text
export type MdastContent = import('mdast').Content
export type MdastParent = import('mdast').Parent
export type MdastRoot = import('mdast').Root
export type State = import('./state.js').State
export type MdastNodes = MdastRoot | MdastContent
export type MdastParents = Extract<MdastNodes, MdastParent>
