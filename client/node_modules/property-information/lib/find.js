/**
 * @typedef {import('./util/schema.js').Schema} Schema
 */

import {normalize} from './normalize.js'
import {DefinedInfo} from './util/defined-info.js'
import {Info} from './util/info.js'

const valid = /^data[-\w.:]+$/i
const dash = /-[a-z]/g
const cap = /[A-Z]/g

/**
 * @param {Schema} schema
 * @param {string} value
 * @returns {Info}
 */
export function find(schema, value) {
  const normal = normalize(value)
  let prop = value
  let Type = Info

  if (normal in schema.normal) {
    return schema.property[schema.normal[normal]]
  }

  if (normal.length > 4 && normal.slice(0, 4) === 'data' && valid.test(value)) {
    // Attribute or property.
    if (value.charAt(4) === '-') {
      // Turn it into a property.
      const rest = value.slice(5).replace(dash, camelcase)
      prop = 'data' + rest.charAt(0).toUpperCase() + rest.slice(1)
    } else {
      // Turn it into an attribute.
      const rest = value.slice(4)

      if (!dash.test(rest)) {
        let dashes = rest.replace(cap, kebab)

        if (dashes.charAt(0) !== '-') {
          dashes = '-' + dashes
        }

        value = 'data' + dashes
      }
    }

    Type = DefinedInfo
  }

  return new Type(prop, value)
}

/**
 * @param {string} $0
 * @returns {string}
 */
function kebab($0) {
  return '-' + $0.toLowerCase()
}

/**
 * @param {string} $0
 * @returns {string}
 */
function camelcase($0) {
  return $0.charAt(1).toUpperCase()
}
