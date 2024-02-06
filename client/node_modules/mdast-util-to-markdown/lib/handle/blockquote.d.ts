/**
 * @typedef {import('mdast').Blockquote} Blockquote
 * @typedef {import('../types.js').Parent} Parent
 * @typedef {import('../types.js').State} State
 * @typedef {import('../types.js').Info} Info
 * @typedef {import('../types.js').Map} Map
 */
/**
 * @param {Blockquote} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function blockquote(
  node: Blockquote,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export type Blockquote = import('mdast').Blockquote
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
export type Map = import('../types.js').Map
