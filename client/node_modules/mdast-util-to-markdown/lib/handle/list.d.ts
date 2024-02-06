/**
 * @param {List} node
 * @param {Parent | undefined} parent
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function list(
  node: List,
  parent: Parent | undefined,
  state: State,
  info: Info
): string
export type List = import('mdast').List
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
