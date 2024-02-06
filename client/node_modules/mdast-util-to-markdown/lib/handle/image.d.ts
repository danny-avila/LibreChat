/**
 * @param {Image} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @param {Info} info
 * @returns {string}
 */
export function image(
  node: Image,
  _: Parent | undefined,
  state: State,
  info: Info
): string
export namespace image {
  export {imagePeek as peek}
}
export type Image = import('mdast').Image
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
export type Info = import('../types.js').Info
/**
 * @returns {string}
 */
declare function imagePeek(): string
export {}
