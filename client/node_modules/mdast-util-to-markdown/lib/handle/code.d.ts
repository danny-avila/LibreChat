/**
 * @param {Code} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function code(
  node: Code,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export type Code = import('mdast').Code
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
export type Map = import('../types.js').Map
