/**
 * @param {Schema} schema
 * @param {string} defaultTagName
 * @param {Array<string>} [caseSensitive]
 */
export function core(
  schema: Schema,
  defaultTagName: string,
  caseSensitive?: string[] | undefined
): {
  (): Root
  (selector: null | undefined, ...children: Array<HChild>): Root
  (
    selector: string,
    properties?: HProperties,
    ...children: Array<HChild>
  ): Element
  (selector: string, ...children: Array<HChild>): Element
}
export type Root = import('hast').Root
export type Content = import('hast').Content
export type Element = import('hast').Element
export type Properties = import('hast').Properties
export type Info = import('property-information').Info
export type Schema = import('property-information').Schema
/**
 * Any concrete `hast` node.
 */
export type Node = Content | Root
/**
 * Result from a `h` (or `s`) call.
 */
export type HResult = Root | Element
/**
 * Value for a CSS style field.
 */
export type HStyleValue = string | number
/**
 * Supported value of a `style` prop.
 */
export type HStyle = Record<string, HStyleValue>
/**
 * Primitive property value.
 */
export type HPrimitiveValue = string | number | boolean | null | undefined
/**
 * List of property values for space- or comma separated values (such as `className`).
 */
export type HArrayValue = Array<string | number>
/**
 * Primitive value or list value.
 */
export type HPropertyValue = HPrimitiveValue | (string | number)[]
/**
 * Acceptable value for element properties.
 */
export type HProperties = {
  [property: string]: HStyle | HPropertyValue
}
/**
 * Primitive children, either ignored (nullish), or turned into text nodes.
 */
export type HPrimitiveChild = string | number | null | undefined
/**
 * List of children.
 */
export type HArrayChild = Array<Node | HPrimitiveChild>
/**
 * Acceptable child value.
 */
export type HChild = Node | HPrimitiveChild | (Node | HPrimitiveChild)[]
