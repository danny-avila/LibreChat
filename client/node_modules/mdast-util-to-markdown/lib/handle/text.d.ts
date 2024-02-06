/**
 * @typedef {import('mdast').Text} Text
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Info} Info
 */
/**
 * @param {Text} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function text(
  node: Text,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export type Text = import('mdast').Text
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
