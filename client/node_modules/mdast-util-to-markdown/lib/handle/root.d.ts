/**
 * @param {Root} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function root(
  node: Root,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export type Root = import('mdast').Root
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
