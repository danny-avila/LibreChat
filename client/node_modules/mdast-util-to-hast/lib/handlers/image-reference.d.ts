/**
 * Turn an mdast `imageReference` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {ImageReference} node
 *   mdast node.
 * @returns {ElementContent | Array<ElementContent>}
 *   hast node.
 */
export function imageReference(
  state: State,
  node: ImageReference
): ElementContent | Array<ElementContent>
export type ElementContent = import('hast').ElementContent
export type Element = import('hast').Element
export type Properties = import('hast').Properties
export type ImageReference = import('mdast').ImageReference
export type State = import('../state.js').State
