/**
 * Create a hast element from a simple CSS selector.
 *
 * @template {string} Selector
 *   Type of selector.
 * @template {string} [DefaultTagName='div']
 *   Type of default tag name.
 * @param {Selector | null | undefined} [selector]
 *   Simple CSS selector.
 *
 *   Can contain a tag-name (`foo`), classes (`.bar`), and an ID (`#baz`).
 *   Multiple classes are allowed.
 *   Uses the last ID if multiple IDs are found.
 * @param {DefaultTagName | null | undefined} [defaultTagName='div']
 *   Tag name to use if `selector` does not specify one (default: `'div'`).
 * @returns {Element & {tagName: import('./extract.js').ExtractTagName<Selector, DefaultTagName>}}
 *   Built element.
 */
export function parseSelector<
  Selector extends string,
  DefaultTagName extends string = 'div'
>(
  selector?: Selector | null | undefined,
  defaultTagName?: DefaultTagName | null | undefined
): import('hast').Element & {
  tagName: import('./extract.js').ExtractTagName<Selector, DefaultTagName>
}
export type Properties = import('hast').Properties
export type Element = import('hast').Element
