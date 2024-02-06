/**
 * @typedef {import('../types.js').Unsafe} Unsafe
 * @typedef {import('../types.js').ConstructName} ConstructName
 */
/**
 * @param {Array<ConstructName>} stack
 * @param {Unsafe} pattern
 * @returns {boolean}
 */
export function patternInScope(
  stack: Array<ConstructName>,
  pattern: Unsafe
): boolean
export type Unsafe = import('../types.js').Unsafe
export type ConstructName = import('../types.js').ConstructName
