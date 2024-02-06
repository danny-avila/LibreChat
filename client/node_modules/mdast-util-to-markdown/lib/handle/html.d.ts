/**
 * @param {HTML} node
 * @returns {string}
 */
export function html(node: HTML): string
export namespace html {
  export {htmlPeek as peek}
}
export type HTML = import('mdast').HTML
/**
 * @returns {string}
 */
declare function htmlPeek(): string
export {}
