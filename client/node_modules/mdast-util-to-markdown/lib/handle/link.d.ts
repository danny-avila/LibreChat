/**
 * @param {Link} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function link(
  node: Link,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export namespace link {
  export {linkPeek as peek}
}
export type Link = import('mdast').Link
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
export type Exit = import('../types.js').Exit
/**
 * @param {Link} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @returns {string}
 */
declare function linkPeek(
  node: Link,
  _: Parent | undefined,
  state: State
): string
export {}
