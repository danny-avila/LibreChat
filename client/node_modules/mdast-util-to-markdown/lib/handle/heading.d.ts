/**
 * @param {Heading} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function heading(
  node: Heading,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export type Heading = import('mdast').Heading
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
