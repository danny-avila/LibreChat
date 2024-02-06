/**
 * Transform a hast tree to Parse5’s AST.
 *
 * @param {Node} tree
 *   Tree to transform.
 * @param {Options | Space | null | undefined} [options]
 *   Configuration.
 * @returns {P5Node}
 *   `parse5` node.
 */
export function toParse5(
  tree: Node,
  options?: Options | Space | null | undefined
): P5Node
export type DefaultTreeAdapterMap = import('parse5').DefaultTreeAdapterMap
export type P5Document = DefaultTreeAdapterMap['document']
export type P5Fragment = DefaultTreeAdapterMap['documentFragment']
export type P5Element = DefaultTreeAdapterMap['element']
export type P5Node = DefaultTreeAdapterMap['node']
export type P5Doctype = DefaultTreeAdapterMap['documentType']
export type P5Comment = DefaultTreeAdapterMap['commentNode']
export type P5Text = DefaultTreeAdapterMap['textNode']
export type P5Parent = DefaultTreeAdapterMap['parentNode']
export type P5Attribute = import('parse5').Token.Attribute
export type P5Child = Exclude<P5Node, P5Document | P5Fragment>
export type Schema = import('property-information').Schema
export type Root = import('hast').Root
export type Doctype = import('hast').DocType
export type Element = import('hast').Element
export type Text = import('hast').Text
export type Comment = import('hast').Comment
export type Content = import('hast').Content
export type Node = Content | Root
export type Space = 'html' | 'svg'
/**
 * Configuration.
 */
export type Options = {
  /**
   * Which space the document is in.
   *
   * When an `<svg>` element is found in the HTML space, this package already
   * automatically switches to and from the SVG space when entering and exiting
   * it.
   */
  space?: Space | null | undefined
}
