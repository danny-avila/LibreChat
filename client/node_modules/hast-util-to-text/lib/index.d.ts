/**
 * Get the plain-text value of a node.
 *
 * ###### Algorithm
 *
 * *   if `tree` is a comment, returns its `value`
 * *   if `tree` is a text, applies normal whitespace collapsing to its
 *     `value`, as defined by the CSS Text spec
 * *   if `tree` is a root or element, applies an algorithm similar to the
 *     `innerText` getter as defined by HTML
 *
 * ###### Notes
 *
 * > 👉 **Note**: the algorithm acts as if `tree` is being rendered, and as if
 * > we’re a CSS-supporting user agent, with scripting enabled.
 *
 * *   if `tree` is an element that is not displayed (such as a `head`), we’ll
 *     still use the `innerText` algorithm instead of switching to `textContent`
 * *   if descendants of `tree` are elements that are not displayed, they are
 *     ignored
 * *   CSS is not considered, except for the default user agent style sheet
 * *   a line feed is collapsed instead of ignored in cases where Fullwidth, Wide,
 *     or Halfwidth East Asian Width characters are used, the same goes for a case
 *     with Chinese, Japanese, or Yi writing systems
 * *   replaced elements (such as `audio`) are treated like non-replaced elements
 *
 * @param {Node} tree
 *   Tree to turn into text.
 * @param {Options} [options]
 *   Configuration (optional).
 * @returns {string}
 *   Serialized `tree`.
 */
export function toText(tree: Node, options?: Options | undefined): string
export type TestFunctionAnything =
  import('hast-util-is-element').TestFunctionAnything
export type Content = import('hast').Content
export type Text = import('hast').Text
export type Comment = import('hast').Comment
export type Root = import('hast').Root
export type Element = import('hast').Element
/**
 * Any node.
 */
export type Node = Content | Root
/**
 * Any parent.
 */
export type Parent = Extract<Node, import('unist').Parent>
/**
 * Valid and useful whitespace values (from CSS).
 */
export type Whitespace = 'normal' | 'pre' | 'nowrap' | 'pre-wrap'
/**
 * Specific break:
 *
 * *   `0` — space
 * *   `1` — line ending
 * *   `2` — blank line
 */
export type BreakNumber = 0 | 1 | 2
/**
 * Forced break.
 */
export type BreakForce = '\n'
/**
 * Whether there was a break.
 */
export type BreakValue = boolean
/**
 * Any value for a break before.
 */
export type BreakBefore = BreakValue | BreakNumber | undefined
/**
 * Any value for a break after.
 */
export type BreakAfter = BreakValue | BreakNumber | BreakForce | undefined
/**
 * Info on current collection.
 */
export type CollectionInfo = {
  /**
   *   Current whitespace setting.
   */
  whitespace: Whitespace
  /**
   *   Whether there was a break before.
   */
  breakBefore: BreakBefore
  /**
   *   Whether there was a break after.
   */
  breakAfter: BreakAfter
}
/**
 * Configuration.
 */
export type Options = {
  /**
   * Initial CSS whitespace setting to use.
   */
  whitespace?: Whitespace | null | undefined
}
