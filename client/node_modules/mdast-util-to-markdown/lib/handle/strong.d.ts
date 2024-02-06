/**
 * @param {Strong} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function strong(
  node: Strong,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export namespace strong {
  export {strongPeek as peek}
}
export type Strong = import('mdast').Strong
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
/**
 * @param {Strong} _
 * @param {Parent | undefined} _1
 * @param {State} state
 * @returns {string}
 */
declare function strongPeek(
  _: Strong,
  _1: Parent | undefined,
  state: State
): string
export {}
