/**
 * @param {Definition} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function definition(
  node: Definition,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export type Definition = import('mdast').Definition
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
