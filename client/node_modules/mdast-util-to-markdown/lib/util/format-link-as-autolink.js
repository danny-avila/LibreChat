/**
 * @typedef {import('mdast').Link} Link
 * @typedef {import('../types.js').State} State
 */

import {toString} from 'mdast-util-to-string'

/**
 * @param {Link} node
 * @param {State} state
 * @returns {boolean}
 */
export function formatLinkAsAutolink(node, state) {
  const raw = toString(node)

  return Boolean(
    !state.options.resourceLink &&
      // If there’s a url…
      node.url &&
      // And there’s a no title…
      !node.title &&
      // And the content of `node` is a single text node…
      node.children &&
      node.children.length === 1 &&
      node.children[0].type === 'text' &&
      // And if the url is the same as the content…
      (raw === node.url || 'mailto:' + raw === node.url) &&
      // And that starts w/ a protocol…
      /^[a-z][a-z+.-]+:/i.test(node.url) &&
      // And that doesn’t contain ASCII control codes (character escapes and
      // references don’t work), space, or angle brackets…
      !/[\0- <>\u007F]/.test(node.url)
  )
}
