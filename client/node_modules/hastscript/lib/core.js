/**
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Content} Content
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Properties} Properties
 * @typedef {import('property-information').Info} Info
 * @typedef {import('property-information').Schema} Schema
 */

/**
 * @typedef {Content | Root} Node
 *   Any concrete `hast` node.
 * @typedef {Root | Element} HResult
 *   Result from a `h` (or `s`) call.
 *
 * @typedef {string | number} HStyleValue
 *   Value for a CSS style field.
 * @typedef {Record<string, HStyleValue>} HStyle
 *   Supported value of a `style` prop.
 * @typedef {string | number | boolean | null | undefined} HPrimitiveValue
 *   Primitive property value.
 * @typedef {Array<string | number>} HArrayValue
 *   List of property values for space- or comma separated values (such as `className`).
 * @typedef {HPrimitiveValue | HArrayValue} HPropertyValue
 *   Primitive value or list value.
 * @typedef {{[property: string]: HPropertyValue | HStyle}} HProperties
 *   Acceptable value for element properties.
 *
 * @typedef {string | number | null | undefined} HPrimitiveChild
 *   Primitive children, either ignored (nullish), or turned into text nodes.
 * @typedef {Array<Node | HPrimitiveChild>} HArrayChild
 *   List of children.
 * @typedef {Node | HPrimitiveChild | HArrayChild} HChild
 *   Acceptable child value.
 */

import {find, normalize} from 'property-information'
import {parseSelector} from 'hast-util-parse-selector'
import {parse as spaces} from 'space-separated-tokens'
import {parse as commas} from 'comma-separated-tokens'

const buttonTypes = new Set(['menu', 'submit', 'reset', 'button'])

const own = {}.hasOwnProperty

/**
 * @param {Schema} schema
 * @param {string} defaultTagName
 * @param {Array<string>} [caseSensitive]
 */
export function core(schema, defaultTagName, caseSensitive) {
  const adjust = caseSensitive && createAdjustMap(caseSensitive)

  const h =
    /**
     * @type {{
     *   (): Root
     *   (selector: null | undefined, ...children: Array<HChild>): Root
     *   (selector: string, properties?: HProperties, ...children: Array<HChild>): Element
     *   (selector: string, ...children: Array<HChild>): Element
     * }}
     */
    (
      /**
       * Hyperscript compatible DSL for creating virtual hast trees.
       *
       * @param {string | null} [selector]
       * @param {HProperties | HChild} [properties]
       * @param {Array<HChild>} children
       * @returns {HResult}
       */
      function (selector, properties, ...children) {
        let index = -1
        /** @type {HResult} */
        let node

        if (selector === undefined || selector === null) {
          node = {type: 'root', children: []}
          // @ts-expect-error Properties are not supported for roots.
          children.unshift(properties)
        } else {
          node = parseSelector(selector, defaultTagName)
          // Normalize the name.
          node.tagName = node.tagName.toLowerCase()
          if (adjust && own.call(adjust, node.tagName)) {
            node.tagName = adjust[node.tagName]
          }

          // Handle props.
          if (isProperties(properties, node.tagName)) {
            /** @type {string} */
            let key

            for (key in properties) {
              if (own.call(properties, key)) {
                // @ts-expect-error `node.properties` is set.
                addProperty(schema, node.properties, key, properties[key])
              }
            }
          } else {
            children.unshift(properties)
          }
        }

        // Handle children.
        while (++index < children.length) {
          addChild(node.children, children[index])
        }

        if (node.type === 'element' && node.tagName === 'template') {
          node.content = {type: 'root', children: node.children}
          node.children = []
        }

        return node
      }
    )

  return h
}

/**
 * @param {HProperties | HChild} value
 * @param {string} name
 * @returns {value is HProperties}
 */
function isProperties(value, name) {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false
  }

  if (name === 'input' || !value.type || typeof value.type !== 'string') {
    return true
  }

  if ('children' in value && Array.isArray(value.children)) {
    return false
  }

  if (name === 'button') {
    return buttonTypes.has(value.type.toLowerCase())
  }

  return !('value' in value)
}

/**
 * @param {Schema} schema
 * @param {Properties} properties
 * @param {string} key
 * @param {HStyle | HPropertyValue} value
 * @returns {void}
 */
function addProperty(schema, properties, key, value) {
  const info = find(schema, key)
  let index = -1
  /** @type {HPropertyValue} */
  let result

  // Ignore nullish and NaN values.
  if (value === undefined || value === null) return

  if (typeof value === 'number') {
    // Ignore NaN.
    if (Number.isNaN(value)) return

    result = value
  }
  // Booleans.
  else if (typeof value === 'boolean') {
    result = value
  }
  // Handle list values.
  else if (typeof value === 'string') {
    if (info.spaceSeparated) {
      result = spaces(value)
    } else if (info.commaSeparated) {
      result = commas(value)
    } else if (info.commaOrSpaceSeparated) {
      result = spaces(commas(value).join(' '))
    } else {
      result = parsePrimitive(info, info.property, value)
    }
  } else if (Array.isArray(value)) {
    result = value.concat()
  } else {
    result = info.property === 'style' ? style(value) : String(value)
  }

  if (Array.isArray(result)) {
    /** @type {Array<string | number>} */
    const finalResult = []

    while (++index < result.length) {
      // @ts-expect-error Assume no booleans in array.
      finalResult[index] = parsePrimitive(info, info.property, result[index])
    }

    result = finalResult
  }

  // Class names (which can be added both on the `selector` and here).
  if (info.property === 'className' && Array.isArray(properties.className)) {
    // @ts-expect-error Assume no booleans in `className`.
    result = properties.className.concat(result)
  }

  properties[info.property] = result
}

/**
 * @param {Array<Content>} nodes
 * @param {HChild} value
 * @returns {void}
 */
function addChild(nodes, value) {
  let index = -1

  if (value === undefined || value === null) {
    // Empty.
  } else if (typeof value === 'string' || typeof value === 'number') {
    nodes.push({type: 'text', value: String(value)})
  } else if (Array.isArray(value)) {
    while (++index < value.length) {
      addChild(nodes, value[index])
    }
  } else if (typeof value === 'object' && 'type' in value) {
    if (value.type === 'root') {
      addChild(nodes, value.children)
    } else {
      nodes.push(value)
    }
  } else {
    throw new Error('Expected node, nodes, or string, got `' + value + '`')
  }
}

/**
 * Parse a single primitives.
 *
 * @param {Info} info
 * @param {string} name
 * @param {HPrimitiveValue} value
 * @returns {HPrimitiveValue}
 */
function parsePrimitive(info, name, value) {
  if (typeof value === 'string') {
    if (info.number && value && !Number.isNaN(Number(value))) {
      return Number(value)
    }

    if (
      (info.boolean || info.overloadedBoolean) &&
      (value === '' || normalize(value) === normalize(name))
    ) {
      return true
    }
  }

  return value
}

/**
 * Serialize a `style` object as a string.
 *
 * @param {HStyle} value
 *   Style object.
 * @returns {string}
 *   CSS string.
 */
function style(value) {
  /** @type {Array<string>} */
  const result = []
  /** @type {string} */
  let key

  for (key in value) {
    if (own.call(value, key)) {
      result.push([key, value[key]].join(': '))
    }
  }

  return result.join('; ')
}

/**
 * Create a map to adjust casing.
 *
 * @param {Array<string>} values
 *   List of properly cased keys.
 * @returns {Record<string, string>}
 *   Map of lowercase keys to uppercase keys.
 */
function createAdjustMap(values) {
  /** @type {Record<string, string>} */
  const result = {}
  let index = -1

  while (++index < values.length) {
    result[values[index].toLowerCase()] = values[index]
  }

  return result
}
