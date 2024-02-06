/**
 * @typedef {import('parse5').DefaultTreeAdapterMap} DefaultTreeAdapterMap
 * @typedef {DefaultTreeAdapterMap['document']} P5Document
 * @typedef {DefaultTreeAdapterMap['documentFragment']} P5Fragment
 * @typedef {DefaultTreeAdapterMap['element']} P5Element
 * @typedef {DefaultTreeAdapterMap['node']} P5Node
 * @typedef {DefaultTreeAdapterMap['documentType']} P5Doctype
 * @typedef {DefaultTreeAdapterMap['commentNode']} P5Comment
 * @typedef {DefaultTreeAdapterMap['textNode']} P5Text
 * @typedef {DefaultTreeAdapterMap['parentNode']} P5Parent
 * @typedef {import('parse5').Token.Attribute} P5Attribute
 * @typedef {Exclude<P5Node, P5Document | P5Fragment>} P5Child
 * @typedef {import('property-information').Schema} Schema
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').DocType} Doctype
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Text} Text
 * @typedef {import('hast').Comment} Comment
 * @typedef {import('hast').Content} Content
 */

/**
 * @typedef {Content | Root} Node
 * @typedef {'html' | 'svg'} Space
 *
 * @typedef Options
 *   Configuration.
 * @property {Space | null | undefined} [space='html']
 *   Which space the document is in.
 *
 *   When an `<svg>` element is found in the HTML space, this package already
 *   automatically switches to and from the SVG space when entering and exiting
 *   it.
 */

import {stringify as commas} from 'comma-separated-tokens'
import {html, svg, find} from 'property-information'
import {stringify as spaces} from 'space-separated-tokens'
import {webNamespaces} from 'web-namespaces'
import {zwitch} from 'zwitch'

const own = {}.hasOwnProperty

/** @type {(from: Node, schema: Schema) => P5Node} */
const one = zwitch('type', {handlers: {root, element, text, comment, doctype}})

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
export function toParse5(tree, options) {
  const space = options && typeof options === 'object' ? options.space : options
  return one(tree, space === 'svg' ? svg : html)
}

/**
 * @param {Root} node
 * @param {Schema} schema
 *   Current schema.
 * @returns {P5Document}
 */
function root(node, schema) {
  /** @type {P5Document} */
  const result = {
    nodeName: '#document',
    // @ts-expect-error: `parse5` uses enums, which are actually strings.
    mode: (node.data || {}).quirksMode ? 'quirks' : 'no-quirks',
    childNodes: []
  }
  result.childNodes = all(node.children, result, schema)
  patch(node, result)
  return result
}

/**
 * @param {Root} node
 * @param {Schema} schema
 *   Current schema.
 * @returns {P5Fragment}
 */
function fragment(node, schema) {
  /** @type {P5Fragment} */
  const result = {nodeName: '#document-fragment', childNodes: []}
  result.childNodes = all(node.children, result, schema)
  patch(node, result)
  return result
}

/**
 * @param {Doctype} node
 * @returns {P5Doctype}
 */
function doctype(node) {
  /** @type {P5Doctype} */
  const result = {
    nodeName: '#documentType',
    name: 'html',
    publicId: '',
    systemId: '',
    // @ts-expect-error: change to `null` in a major?
    parentNode: undefined
  }

  patch(node, result)
  return result
}

/**
 * @param {Text} node
 * @returns {P5Text}
 */
function text(node) {
  /** @type {P5Text} */
  const result = {
    nodeName: '#text',
    value: node.value,
    // @ts-expect-error: no `parentNode`
    parentNode: undefined
  }
  patch(node, result)
  return result
}

/**
 * @param {Comment} node
 * @returns {P5Comment}
 */
function comment(node) {
  /** @type {P5Comment} */
  const result = {
    nodeName: '#comment',
    data: node.value,
    // @ts-expect-error: no `parentNode`
    parentNode: undefined
  }

  patch(node, result)

  return result
}

/**
 * @param {Element} node
 * @param {Schema} schema
 *   Current schema.
 * @returns {P5Element}
 *   `parse5` node.
 */
function element(node, schema) {
  const parentSchema = schema
  let currentSchema = parentSchema

  if (
    node.type === 'element' &&
    node.tagName.toLowerCase() === 'svg' &&
    parentSchema.space === 'html'
  ) {
    currentSchema = svg
  }

  /** @type {Array<P5Attribute>} */
  const attrs = []
  /** @type {string} */
  let prop

  if (node.properties) {
    for (prop in node.properties) {
      if (prop !== 'children' && own.call(node.properties, prop)) {
        const result = createProperty(
          currentSchema,
          prop,
          node.properties[prop]
        )

        if (result) {
          attrs.push(result)
        }
      }
    }
  }

  /** @type {P5Element} */
  const result = {
    nodeName: node.tagName,
    tagName: node.tagName,
    attrs,
    // @ts-expect-error: html and svg both have a space.
    namespaceURI: webNamespaces[currentSchema.space],
    childNodes: [],
    // @ts-expect-error: no `parentNode`
    parentNode: undefined
  }
  result.childNodes = all(node.children, result, currentSchema)
  patch(node, result)

  if (node.tagName === 'template' && node.content) {
    // @ts-expect-error: `parse5` types are wrong.
    result.content = fragment(node.content, currentSchema)
  }

  return result
}

/**
 * Handle a property.
 *
 * @param {Schema} schema
 *   Current schema.
 * @param {string} prop
 *   Key.
 * @param {Array<string | number> | string | number | boolean | null | undefined} value
 *   hast property value.
 * @returns {P5Attribute | void}
 *   Field for runtime, optional.
 */
function createProperty(schema, prop, value) {
  const info = find(schema, prop)

  // Ignore nullish and `NaN` values.
  if (
    value === undefined ||
    value === null ||
    value === false ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (!value && info.boolean)
  ) {
    return
  }

  if (Array.isArray(value)) {
    // Accept `array`.
    // Most props are space-separated.
    value = info.commaSeparated ? commas(value) : spaces(value)
  }

  /** @type {P5Attribute} */
  const attribute = {
    name: info.attribute,
    value: value === true ? '' : String(value)
  }

  if (info.space && info.space !== 'html' && info.space !== 'svg') {
    const index = attribute.name.indexOf(':')

    if (index < 0) {
      attribute.prefix = ''
    } else {
      attribute.name = attribute.name.slice(index + 1)
      attribute.prefix = info.attribute.slice(0, index)
    }

    attribute.namespace = webNamespaces[info.space]
  }

  return attribute
}

/**
 * Transform all hast nodes.
 *
 * @param {Array<Content>} children
 *   List of children.
 * @param {P5Parent} parentNode
 *   `parse5` parent node.
 * @param {Schema} schema
 *   Current schema.
 * @returns {Array<P5Child>}
 *   Transformed children.
 */
function all(children, parentNode, schema) {
  let index = -1
  /** @type {Array<P5Child>} */
  const results = []

  if (children) {
    while (++index < children.length) {
      /** @type {P5Child} */
      // @ts-expect-error assume no document.
      const child = one(children[index], schema)

      child.parentNode = parentNode

      results.push(child)
    }
  }

  return results
}

/**
 * Add position info from `from` to `to`.
 *
 * @param {Node} from
 *   hast node.
 * @param {P5Node} to
 *   `parse5` node.
 * @returns {void}
 *   Nothing.
 */
function patch(from, to) {
  const position = from.position

  if (position && position.start && position.end) {
    to.sourceCodeLocation = {
      startLine: position.start.line,
      startCol: position.start.column,
      // @ts-expect-error assume this is set.
      startOffset: position.start.offset,
      endLine: position.end.line,
      endCol: position.end.column,
      // @ts-expect-error assume this is set.
      endOffset: position.end.offset
    }
  }
}
