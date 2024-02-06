/**
 * @param {InlineCode} node
 * @param {Parent | undefined} _
 * @param {State} state
 * @returns {string}
 */
export function inlineCode(
  node: InlineCode,
  _: Parent | undefined,
  state: State
): string
export namespace inlineCode {
  export {inlineCodePeek as peek}
}
export type InlineCode = import('mdast').InlineCode
export type Parent = import('../types.js').Parent
export type State = import('../types.js').State
/**
 * @returns {string}
 */
declare function inlineCodePeek(): string
export {}
