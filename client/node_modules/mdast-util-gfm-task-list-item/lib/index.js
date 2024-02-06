/**
 * @typedef {import('mdast').Content} Content
 * @typedef {import('mdast').ListItem} ListItem
 * @typedef {import('mdast').Paragraph} Paragraph
 * @typedef {import('mdast').Parent} Parent
 * @typedef {import('mdast').Root} Root
 * @typedef {import('mdast-util-from-markdown').CompileContext} CompileContext
 * @typedef {import('mdast-util-from-markdown').Extension} FromMarkdownExtension
 * @typedef {import('mdast-util-from-markdown').Handle} FromMarkdownHandle
 * @typedef {import('mdast-util-to-markdown').Options} ToMarkdownExtension
 * @typedef {import('mdast-util-to-markdown').Handle} ToMarkdownHandle
 */

/**
 * @typedef {Extract<Root | Content, Parent>} Parents
 */

import {listItem} from 'mdast-util-to-markdown/lib/handle/list-item.js'
import {track} from 'mdast-util-to-markdown/lib/util/track.js'

// To do: next major: rename `context` -> `state`, `safeOptions` -> `info`, use
// `track` from `state`.
// To do: next major: replace exports with functions.
// To do: next major: use `defaulthandlers.listItem`.

/**
 * Extension for `mdast-util-from-markdown` to enable GFM task list items.
 *
 * @type {FromMarkdownExtension}
 */
export const gfmTaskListItemFromMarkdown = {
  exit: {
    taskListCheckValueChecked: exitCheck,
    taskListCheckValueUnchecked: exitCheck,
    paragraph: exitParagraphWithTaskListItem
  }
}

/**
 * Extension for `mdast-util-to-markdown` to enable GFM task list items.
 *
 * @type {ToMarkdownExtension}
 */
export const gfmTaskListItemToMarkdown = {
  unsafe: [{atBreak: true, character: '-', after: '[:|-]'}],
  handlers: {listItem: listItemWithTaskListItem}
}

/**
 * @this {CompileContext}
 * @type {FromMarkdownHandle}
 */
function exitCheck(token) {
  const node = /** @type {ListItem} */ (this.stack[this.stack.length - 2])
  // We’re always in a paragraph, in a list item.
  node.checked = token.type === 'taskListCheckValueChecked'
}

/**
 * @this {CompileContext}
 * @type {FromMarkdownHandle}
 */
function exitParagraphWithTaskListItem(token) {
  const parent = /** @type {Parents} */ (this.stack[this.stack.length - 2])

  if (
    parent &&
    parent.type === 'listItem' &&
    typeof parent.checked === 'boolean'
  ) {
    const node = /** @type {Paragraph} */ (this.stack[this.stack.length - 1])
    const head = node.children[0]

    if (head && head.type === 'text') {
      const siblings = parent.children
      let index = -1
      /** @type {Paragraph | undefined} */
      let firstParaghraph

      while (++index < siblings.length) {
        const sibling = siblings[index]
        if (sibling.type === 'paragraph') {
          firstParaghraph = sibling
          break
        }
      }

      if (firstParaghraph === node) {
        // Must start with a space or a tab.
        head.value = head.value.slice(1)

        if (head.value.length === 0) {
          node.children.shift()
        } else if (
          node.position &&
          head.position &&
          typeof head.position.start.offset === 'number'
        ) {
          head.position.start.column++
          head.position.start.offset++
          node.position.start = Object.assign({}, head.position.start)
        }
      }
    }
  }

  this.exit(token)
}

/**
 * @type {ToMarkdownHandle}
 * @param {ListItem} node
 */
function listItemWithTaskListItem(node, parent, context, safeOptions) {
  const head = node.children[0]
  const checkable =
    typeof node.checked === 'boolean' && head && head.type === 'paragraph'
  const checkbox = '[' + (node.checked ? 'x' : ' ') + '] '
  const tracker = track(safeOptions)

  if (checkable) {
    tracker.move(checkbox)
  }

  let value = listItem(node, parent, context, {
    ...safeOptions,
    ...tracker.current()
  })

  if (checkable) {
    value = value.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, check)
  }

  return value

  /**
   * @param {string} $0
   * @returns {string}
   */
  function check($0) {
    return $0 + checkbox
  }
}
