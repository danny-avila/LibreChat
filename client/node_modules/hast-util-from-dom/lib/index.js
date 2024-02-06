/**
 * @typedef {import('hast').Root} HastRoot
 * @typedef {import('hast').DocType} HastDoctype
 * @typedef {import('hast').Element} HastElement
 * @typedef {import('hast').Text} HastText
 * @typedef {import('hast').Comment} HastComment
 * @typedef {import('hast').Content} HastContent
 */

/**
 * @typedef {HastContent | HastRoot} HastNode
 *
 * @callback AfterTransform
 *   Callback called when each node is transformed.
 * @param {Node} domNode
 *   DOM node that was handled.
 * @param {HastNode} hastNode
 *   Corresponding hast node.
 * @returns {void}
 *   Nothing.
 *
 * @typedef Options
 *   Configuration.
 * @property {AfterTransform | null | undefined} [afterTransform]
 *   Callback called when each node is transformed.
 */

import {webNamespaces} from 'web-namespaces'
import {h, s} from 'hastscript'

/**
 * Transform a DOM tree to a hast tree.
 *
 * @param {Node} tree
 *   DOM tree to transform.
 * @param {Options | null | undefined} [options]
 *   Configuration (optional).
 * @returns {HastNode}
 *   Equivalent hast node.
 */
export function fromDom(tree, options) {
  const result = tree ? transform(tree, options || {}) : undefined
  return result || {type: 'root', children: []}
}

/**
 * @param {Node} node
 *   DOM node to transform.
 * @param {Options} options
 *   Configuration.
 * @returns {HastNode | undefined}
 *   Equivalent hast node.
 *
 *   Note that certain legacy DOM nodes (i.e., Attr nodes (2),  CDATA, processing instructions)
 */
function transform(node, options) {
  const transformed = one(node, options)
  if (transformed && options.afterTransform)
    options.afterTransform(node, transformed)
  return transformed
}

/**
 * @param {Node} node
 *   DOM node to transform.
 * @param {Options} options
 *   Configuration.
 * @returns {HastNode | undefined}
 *   Equivalent hast node.
 */
function one(node, options) {
  switch (node.nodeType) {
    case 1 /* Element */: {
      // @ts-expect-error TypeScript is wrong.
      return element(node, options)
    }

    // Ignore: Attr (2).

    case 3 /* Text */: {
      // @ts-expect-error TypeScript is wrong.
      return text(node)
    }

    // Ignore: CDATA (4).
    // Removed: Entity reference (5)
    // Removed: Entity (6)
    // Ignore: Processing instruction (7).

    case 8 /* Comment */: {
      // @ts-expect-error TypeScript is wrong.
      return comment(node)
    }

    case 9 /* Document */: {
      // @ts-expect-error TypeScript is wrong.
      return root(node, options)
    }

    case 10 /* Document type */: {
      return doctype()
    }

    case 11 /* Document fragment */: {
      // @ts-expect-error TypeScript is wrong.
      return root(node, options)
    }

    default: {
      return undefined
    }
  }
}

/**
 * Transform a document.
 *
 * @param {Document | DocumentFragment} node
 *   DOM node to transform.
 * @param {Options} options
 *   Configuration.
 * @returns {HastRoot}
 *   Equivalent hast node.
 */
function root(node, options) {
  return {type: 'root', children: all(node, options)}
}

/**
 * Transform a doctype.
 *
 * @returns {HastDoctype}
 *   Equivalent hast node.
 */
function doctype() {
  // @ts-expect-error hast types out of date.
  return {type: 'doctype'}
}

/**
 * Transform a text.
 *
 * @param {Text} node
 *   DOM node to transform.
 * @returns {HastText}
 *   Equivalent hast node.
 */
function text(node) {
  return {type: 'text', value: node.nodeValue || ''}
}

/**
 * Transform a comment.
 *
 * @param {Comment} node
 *   DOM node to transform.
 * @returns {HastComment}
 *   Equivalent hast node.
 */
function comment(node) {
  return {type: 'comment', value: node.nodeValue || ''}
}

/**
 * Transform an element.
 *
 * @param {Element} node
 *   DOM node to transform.
 * @param {Options} options
 *   Configuration.
 * @returns {HastElement}
 *   Equivalent hast node.
 */
function element(node, options) {
  const space = node.namespaceURI
  const fn = space === webNamespaces.svg ? s : h
  const tagName =
    space === webNamespaces.html ? node.tagName.toLowerCase() : node.tagName
  /** @type {DocumentFragment | Element} */
  const content =
    // @ts-expect-error Types are wrong.
    space === webNamespaces.html && tagName === 'template' ? node.content : node
  const attributes = node.getAttributeNames()
  /** @type {Record<string, string>} */
  const props = {}
  let index = -1

  while (++index < attributes.length) {
    props[attributes[index]] = node.getAttribute(attributes[index]) || ''
  }

  return fn(tagName, props, all(content, options))
}

/**
 * Transform child nodes in a parent.
 *
 * @param {Document | DocumentFragment | Element} node
 *   DOM node to transform.
 * @param {Options} options
 *   Configuration.
 * @returns {Array<HastContent>}
 *   Equivalent hast nodes.
 */
function all(node, options) {
  const nodes = node.childNodes
  /** @type {Array<HastContent>} */
  const children = []
  let index = -1

  while (++index < nodes.length) {
    const child = transform(nodes[index], options)

    if (child !== undefined) {
      // @ts-expect-error Assume no document inside document.
      children.push(child)
    }
  }

  return children
}
