/**
 * @template T
 * @typedef {import('react').ComponentType<T>} ComponentType<T>
 */

/**
 * @template {import('react').ElementType} T
 * @typedef {import('react').ComponentPropsWithoutRef<T>} ComponentPropsWithoutRef<T>
 */

/**
 * @typedef {import('react').ReactNode} ReactNode
 * @typedef {import('unist').Position} Position
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').ElementContent} ElementContent
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Text} Text
 * @typedef {import('hast').Comment} Comment
 * @typedef {import('hast').DocType} Doctype
 * @typedef {import('property-information').Info} Info
 * @typedef {import('property-information').Schema} Schema
 * @typedef {import('./complex-types.js').ReactMarkdownProps} ReactMarkdownProps
 *
 * @typedef Raw
 * @property {'raw'} type
 * @property {string} value
 *
 * @typedef Context
 * @property {Options} options
 * @property {Schema} schema
 * @property {number} listDepth
 *
 * @callback TransformLink
 * @param {string} href
 * @param {Array<ElementContent>} children
 * @param {string?} title
 * @returns {string}
 *
 * @callback TransformImage
 * @param {string} src
 * @param {string} alt
 * @param {string?} title
 * @returns {string}
 *
 * @typedef {import('react').HTMLAttributeAnchorTarget} TransformLinkTargetType
 *
 * @callback TransformLinkTarget
 * @param {string} href
 * @param {Array<ElementContent>} children
 * @param {string?} title
 * @returns {TransformLinkTargetType|undefined}
 *
 * @typedef {keyof JSX.IntrinsicElements} ReactMarkdownNames
 *
 * To do: is `data-sourcepos` typeable?
 *
 * @typedef {ComponentPropsWithoutRef<'code'> & ReactMarkdownProps & {inline?: boolean}} CodeProps
 * @typedef {ComponentPropsWithoutRef<'h1'> & ReactMarkdownProps & {level: number}} HeadingProps
 * @typedef {ComponentPropsWithoutRef<'li'> & ReactMarkdownProps & {checked: boolean|null, index: number, ordered: boolean}} LiProps
 * @typedef {ComponentPropsWithoutRef<'ol'> & ReactMarkdownProps & {depth: number, ordered: true}} OrderedListProps
 * @typedef {ComponentPropsWithoutRef<'td'> & ReactMarkdownProps & {style?: Record<string, unknown>, isHeader: false}} TableDataCellProps
 * @typedef {ComponentPropsWithoutRef<'th'> & ReactMarkdownProps & {style?: Record<string, unknown>, isHeader: true}} TableHeaderCellProps
 * @typedef {ComponentPropsWithoutRef<'tr'> & ReactMarkdownProps & {isHeader: boolean}} TableRowProps
 * @typedef {ComponentPropsWithoutRef<'ul'> & ReactMarkdownProps & {depth: number, ordered: false}} UnorderedListProps
 *
 * @typedef {ComponentType<CodeProps>} CodeComponent
 * @typedef {ComponentType<HeadingProps>} HeadingComponent
 * @typedef {ComponentType<LiProps>} LiComponent
 * @typedef {ComponentType<OrderedListProps>} OrderedListComponent
 * @typedef {ComponentType<TableDataCellProps>} TableDataCellComponent
 * @typedef {ComponentType<TableHeaderCellProps>} TableHeaderCellComponent
 * @typedef {ComponentType<TableRowProps>} TableRowComponent
 * @typedef {ComponentType<UnorderedListProps>} UnorderedListComponent
 *
 * @typedef SpecialComponents
 * @property {CodeComponent|ReactMarkdownNames} code
 * @property {HeadingComponent|ReactMarkdownNames} h1
 * @property {HeadingComponent|ReactMarkdownNames} h2
 * @property {HeadingComponent|ReactMarkdownNames} h3
 * @property {HeadingComponent|ReactMarkdownNames} h4
 * @property {HeadingComponent|ReactMarkdownNames} h5
 * @property {HeadingComponent|ReactMarkdownNames} h6
 * @property {LiComponent|ReactMarkdownNames} li
 * @property {OrderedListComponent|ReactMarkdownNames} ol
 * @property {TableDataCellComponent|ReactMarkdownNames} td
 * @property {TableHeaderCellComponent|ReactMarkdownNames} th
 * @property {TableRowComponent|ReactMarkdownNames} tr
 * @property {UnorderedListComponent|ReactMarkdownNames} ul
 *
 * @typedef {Partial<Omit<import('./complex-types.js').NormalComponents, keyof SpecialComponents> & SpecialComponents>} Components
 *
 * @typedef Options
 * @property {boolean} [sourcePos=false]
 * @property {boolean} [rawSourcePos=false]
 * @property {boolean} [skipHtml=false]
 * @property {boolean} [includeElementIndex=false]
 * @property {null|false|TransformLink} [transformLinkUri]
 * @property {TransformImage} [transformImageUri]
 * @property {TransformLinkTargetType|TransformLinkTarget} [linkTarget]
 * @property {Components} [components]
 */

import React from 'react'
import ReactIs from 'react-is'
import {whitespace} from 'hast-util-whitespace'
import {svg, find, hastToReact} from 'property-information'
import {stringify as spaces} from 'space-separated-tokens'
import {stringify as commas} from 'comma-separated-tokens'
import style from 'style-to-object'
import {uriTransformer} from './uri-transformer.js'

const own = {}.hasOwnProperty

// The table-related elements that must not contain whitespace text according
// to React.
const tableElements = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr'])

/**
 * @param {Context} context
 * @param {Element|Root} node
 */
export function childrenToReact(context, node) {
  /** @type {Array<ReactNode>} */
  const children = []
  let childIndex = -1
  /** @type {Comment|Doctype|Element|Raw|Text} */
  let child

  while (++childIndex < node.children.length) {
    child = node.children[childIndex]

    if (child.type === 'element') {
      children.push(toReact(context, child, childIndex, node))
    } else if (child.type === 'text') {
      // Currently, a warning is triggered by react for *any* white space in
      // tables.
      // So we drop it.
      // See: <https://github.com/facebook/react/pull/7081>.
      // See: <https://github.com/facebook/react/pull/7515>.
      // See: <https://github.com/remarkjs/remark-react/issues/64>.
      // See: <https://github.com/remarkjs/react-markdown/issues/576>.
      if (
        node.type !== 'element' ||
        !tableElements.has(node.tagName) ||
        !whitespace(child)
      ) {
        children.push(child.value)
      }
    } else if (child.type === 'raw' && !context.options.skipHtml) {
      // Default behavior is to show (encoded) HTML.
      children.push(child.value)
    }
  }

  return children
}

/**
 * @param {Context} context
 * @param {Element} node
 * @param {number} index
 * @param {Element|Root} parent
 */
function toReact(context, node, index, parent) {
  const options = context.options
  const transform =
    options.transformLinkUri === undefined
      ? uriTransformer
      : options.transformLinkUri
  const parentSchema = context.schema
  /** @type {ReactMarkdownNames} */
  // @ts-expect-error assume a known HTML/SVG element.
  const name = node.tagName
  /** @type {Record<string, unknown>} */
  const properties = {}
  let schema = parentSchema
  /** @type {string} */
  let property

  if (parentSchema.space === 'html' && name === 'svg') {
    schema = svg
    context.schema = schema
  }

  if (node.properties) {
    for (property in node.properties) {
      if (own.call(node.properties, property)) {
        addProperty(properties, property, node.properties[property], context)
      }
    }
  }

  if (name === 'ol' || name === 'ul') {
    context.listDepth++
  }

  const children = childrenToReact(context, node)

  if (name === 'ol' || name === 'ul') {
    context.listDepth--
  }

  // Restore parent schema.
  context.schema = parentSchema

  // Nodes created by plugins do not have positional info, in which case we use
  // an object that matches the position interface.
  const position = node.position || {
    start: {line: null, column: null, offset: null},
    end: {line: null, column: null, offset: null}
  }
  const component =
    options.components && own.call(options.components, name)
      ? options.components[name]
      : name
  const basic = typeof component === 'string' || component === React.Fragment

  if (!ReactIs.isValidElementType(component)) {
    throw new TypeError(
      `Component for name \`${name}\` not defined or is not renderable`
    )
  }

  properties.key = index

  if (name === 'a' && options.linkTarget) {
    properties.target =
      typeof options.linkTarget === 'function'
        ? options.linkTarget(
            String(properties.href || ''),
            node.children,
            typeof properties.title === 'string' ? properties.title : null
          )
        : options.linkTarget
  }

  if (name === 'a' && transform) {
    properties.href = transform(
      String(properties.href || ''),
      node.children,
      typeof properties.title === 'string' ? properties.title : null
    )
  }

  if (
    !basic &&
    name === 'code' &&
    parent.type === 'element' &&
    parent.tagName !== 'pre'
  ) {
    properties.inline = true
  }

  if (
    !basic &&
    (name === 'h1' ||
      name === 'h2' ||
      name === 'h3' ||
      name === 'h4' ||
      name === 'h5' ||
      name === 'h6')
  ) {
    properties.level = Number.parseInt(name.charAt(1), 10)
  }

  if (name === 'img' && options.transformImageUri) {
    properties.src = options.transformImageUri(
      String(properties.src || ''),
      String(properties.alt || ''),
      typeof properties.title === 'string' ? properties.title : null
    )
  }

  if (!basic && name === 'li' && parent.type === 'element') {
    const input = getInputElement(node)
    properties.checked =
      input && input.properties ? Boolean(input.properties.checked) : null
    properties.index = getElementsBeforeCount(parent, node)
    properties.ordered = parent.tagName === 'ol'
  }

  if (!basic && (name === 'ol' || name === 'ul')) {
    properties.ordered = name === 'ol'
    properties.depth = context.listDepth
  }

  if (name === 'td' || name === 'th') {
    if (properties.align) {
      if (!properties.style) properties.style = {}
      // @ts-expect-error assume `style` is an object
      properties.style.textAlign = properties.align
      delete properties.align
    }

    if (!basic) {
      properties.isHeader = name === 'th'
    }
  }

  if (!basic && name === 'tr' && parent.type === 'element') {
    properties.isHeader = Boolean(parent.tagName === 'thead')
  }

  // If `sourcePos` is given, pass source information (line/column info from markdown source).
  if (options.sourcePos) {
    properties['data-sourcepos'] = flattenPosition(position)
  }

  if (!basic && options.rawSourcePos) {
    properties.sourcePosition = node.position
  }

  // If `includeElementIndex` is given, pass node index info to components.
  if (!basic && options.includeElementIndex) {
    properties.index = getElementsBeforeCount(parent, node)
    properties.siblingCount = getElementsBeforeCount(parent)
  }

  if (!basic) {
    properties.node = node
  }

  // Ensure no React warnings are emitted for void elements w/ children.
  return children.length > 0
    ? React.createElement(component, properties, children)
    : React.createElement(component, properties)
}

/**
 * @param {Element|Root} node
 * @returns {Element?}
 */
function getInputElement(node) {
  let index = -1

  while (++index < node.children.length) {
    const child = node.children[index]

    if (child.type === 'element' && child.tagName === 'input') {
      return child
    }
  }

  return null
}

/**
 * @param {Element|Root} parent
 * @param {Element} [node]
 * @returns {number}
 */
function getElementsBeforeCount(parent, node) {
  let index = -1
  let count = 0

  while (++index < parent.children.length) {
    if (parent.children[index] === node) break
    if (parent.children[index].type === 'element') count++
  }

  return count
}

/**
 * @param {Record<string, unknown>} props
 * @param {string} prop
 * @param {unknown} value
 * @param {Context} ctx
 */
function addProperty(props, prop, value, ctx) {
  const info = find(ctx.schema, prop)
  let result = value

  // Ignore nullish and `NaN` values.
  // eslint-disable-next-line no-self-compare
  if (result === null || result === undefined || result !== result) {
    return
  }

  // Accept `array`.
  // Most props are space-separated.
  if (Array.isArray(result)) {
    result = info.commaSeparated ? commas(result) : spaces(result)
  }

  if (info.property === 'style' && typeof result === 'string') {
    result = parseStyle(result)
  }

  if (info.space && info.property) {
    props[
      own.call(hastToReact, info.property)
        ? hastToReact[info.property]
        : info.property
    ] = result
  } else if (info.attribute) {
    props[info.attribute] = result
  }
}

/**
 * @param {string} value
 * @returns {Record<string, string>}
 */
function parseStyle(value) {
  /** @type {Record<string, string>} */
  const result = {}

  try {
    style(value, iterator)
  } catch {
    // Silent.
  }

  return result

  /**
   * @param {string} name
   * @param {string} v
   */
  function iterator(name, v) {
    const k = name.slice(0, 4) === '-ms-' ? `ms-${name.slice(4)}` : name
    result[k.replace(/-([a-z])/g, styleReplacer)] = v
  }
}

/**
 * @param {unknown} _
 * @param {string} $1
 */
function styleReplacer(_, $1) {
  return $1.toUpperCase()
}

/**
 * @param {Position|{start: {line: null, column: null, offset: null}, end: {line: null, column: null, offset: null}}} pos
 * @returns {string}
 */
function flattenPosition(pos) {
  return [
    pos.start.line,
    ':',
    pos.start.column,
    '-',
    pos.end.line,
    ':',
    pos.end.column
  ]
    .map(String)
    .join('')
}
