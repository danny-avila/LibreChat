/**
 * @typedef {import('hast').Properties} Properties
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').ElementContent} ElementContent
 * @typedef {import('mdast').Content} Content
 * @typedef {import('mdast').Parent} Parent
 * @typedef {import('mdast').Root} Root
 * @typedef {import('mdast').TableRow} TableRow
 * @typedef {import('../state.js').State} State
 */
/**
 * @typedef {Root | Content} Nodes
 * @typedef {Extract<Nodes, Parent>} Parents
 */
/**
 * Turn an mdast `tableRow` node into hast.
 *
 * @param {State} state
 *   Info passed around.
 * @param {TableRow} node
 *   mdast node.
 * @param {Parents | null | undefined} parent
 *   Parent of `node`.
 * @returns {Element}
 *   hast node.
 */
export function tableRow(
  state: State,
  node: TableRow,
  parent: Parents | null | undefined
): Element
export type Properties = import('hast').Properties
export type Element = import('hast').Element
export type ElementContent = import('hast').ElementContent
export type Content = import('mdast').Content
export type Parent = import('mdast').Parent
export type Root = import('mdast').Root
export type TableRow = import('mdast').TableRow
export type State = import('../state.js').State
export type Nodes = Root | Content
export type Parents = Extract<Nodes, Parent>
