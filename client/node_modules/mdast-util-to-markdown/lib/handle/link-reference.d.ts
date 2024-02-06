/**
 * @param {LinkReference} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function linkReference(
  node: LinkReference,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export namespace linkReference {
  export {linkReferencePeek as peek}
}
export type LinkReference = import('mdast').LinkReference
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
/**
 * @returns {string}
 */
declare function linkReferencePeek(): string
export {}
