/**
 * @typedef {import('./schema.js').Properties} Properties
 * @typedef {import('./schema.js').Normal} Normal
 */

import {Schema} from './schema.js'

/**
 * @param {Schema[]} definitions
 * @param {string} [space]
 * @returns {Schema}
 */
export function merge(definitions, space) {
  /** @type {Properties} */
  const property = {}
  /** @type {Normal} */
  const normal = {}
  let index = -1

  while (++index < definitions.length) {
    Object.assign(property, definitions[index].property)
    Object.assign(normal, definitions[index].normal)
  }

  return new Schema(property, normal, space)
}
