import {caseSensitiveTransform} from './case-sensitive-transform.js'

/**
 * @param {Record<string, string>} attributes
 * @param {string} property
 * @returns {string}
 */
export function caseInsensitiveTransform(attributes, property) {
  return caseSensitiveTransform(attributes, property.toLowerCase())
}
