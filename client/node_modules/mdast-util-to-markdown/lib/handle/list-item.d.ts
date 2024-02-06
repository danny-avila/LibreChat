/**
 * @param {ListItem} node
 * @param {Parent | undefined} parent
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function listItem(
  node: ListItem,
  parent: Parent | undefined,
  state: State,
  info: Info
): string
export type ListItem = import('mdast').ListItem
export type Map = import('../types.js').Map
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
