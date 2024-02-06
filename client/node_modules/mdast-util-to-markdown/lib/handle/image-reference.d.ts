/**
 * @param {ImageReference} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function imageReference(
  node: ImageReference,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export namespace imageReference {
  export {imageReferencePeek as peek}
}
export type ImageReference = import('mdast').ImageReference
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
/**
 * @returns {string}
 */
declare function imageReferencePeek(): string
export {}
