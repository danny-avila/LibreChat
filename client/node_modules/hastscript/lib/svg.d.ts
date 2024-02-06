export const s: {
  (): import('hast').Root
  (
    selector: null | undefined,
    ...children: import('./core.js').HChild[]
  ): import('hast').Root
  (
    selector: string,
    properties?: import('./core.js').HProperties | undefined,
    ...children: import('./core.js').HChild[]
  ): import('hast').Element
  (
    selector: string,
    ...children: import('./core.js').HChild[]
  ): import('hast').Element
}
export namespace s {
  namespace JSX {
    type Element = import('./jsx-classic.js').Element
    type IntrinsicAttributes = import('./jsx-classic.js').IntrinsicAttributes
    type IntrinsicElements = import('./jsx-classic.js').IntrinsicElements
    type ElementChildrenAttribute =
      import('./jsx-classic.js').ElementChildrenAttribute
  }
}
/**
 * Acceptable child value.
 */
export type Child = import('./core.js').HChild
/**
 * Acceptable value for element properties.
 */
export type Properties = import('./core.js').HProperties
/**
 * Result from a `h` (or `s`) call.
 */
export type Result = import('./core.js').HResult
