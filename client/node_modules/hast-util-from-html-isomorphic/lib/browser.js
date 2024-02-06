/**
 * @typedef {import('hast').Root} Root
 * @typedef {typeof import('./index.js').fromHtmlIsomorphic} FromHtmlIsomorphic
 */

import {fromDom} from 'hast-util-from-dom'

const parser = new DOMParser()

/** @type {FromHtmlIsomorphic} */
export function fromHtmlIsomorphic(value, options) {
  const node = options?.fragment
    ? parseFragment(value)
    : parser.parseFromString(value, 'text/html')

  return /** @type {Root} */ (fromDom(node))
}

/**
 * Parse as a fragment.
 *
 * @param {string} value
 * @returns {DocumentFragment}
 */
function parseFragment(value) {
  const template = document.createElement('template')
  template.innerHTML = value
  return template.content
}
