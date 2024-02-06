/**
 * @typedef {import('hast').ElementContent} ElementContent
 *
 * @typedef {import('mdast').Content} Content
 * @typedef {import('mdast').Reference} Reference
 * @typedef {import('mdast').Root} Root
 *
 * @typedef {import('./state.js').State} State
 */
/**
 * @typedef {Root | Content} Nodes
 * @typedef {Extract<Nodes, Reference>} References
 */
/**
 * Return the content of a reference without definition as plain text.
 *
 * @param {State} state
 *   Info passed around.
 * @param {References} node
 *   Reference node (image, link).
 * @returns {ElementContent | Array<ElementContent>}
 *   hast content.
 */
export function revert(
  state: State,
  node: References
): ElementContent | Array<ElementContent>
export type ElementContent = import('hast').ElementContent
export type Content = import('mdast').Content
export type Reference = import('mdast').Reference
export type Root = import('mdast').Root
export type State = import('./state.js').State
export type Nodes = Root | Content
export type References = Extract<Nodes, Reference>
