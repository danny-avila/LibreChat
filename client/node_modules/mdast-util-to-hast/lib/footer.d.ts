/**
 * Generate a hast footer for called footnote definitions.
 *
 * @param {State} state
 *   Info passed around.
 * @returns {Element | undefined}
 *   `section` element or `undefined`.
 */
export function footer(state: State): Element | undefined
export type Element = import('hast').Element
export type ElementContent = import('hast').ElementContent
export type State = import('./state.js').State
