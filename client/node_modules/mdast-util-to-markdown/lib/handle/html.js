/**
 * @typedef {import('mdast').HTML} HTML
 */

html.peek = htmlPeek

/**
 * @param {HTML} node
 * @returns {string}
 */
export function html(node) {
  return node.value || ''
}

/**
 * @returns {string}
 */
function htmlPeek() {
  return '<'
}
