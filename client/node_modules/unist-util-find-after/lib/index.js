/**
 * @typedef {import('unist').Node} Node
 * @typedef {import('unist').Parent} Parent
 * @typedef {import('unist-util-is').Test} Test
 */

import {convert} from 'unist-util-is'

/**
 * Find the first node in `parent` after another `node` or after an index,
 * that passes `test`.

 * @param parent
 *   Parent node.
 * @param index
 *   Child of `parent` or it’s index.
 * @param test
 *   `unist-util-is`-compatible test.
 * @returns
 *   Child of `parent` or `null`.
 */
export const findAfter =
  /**
   * @type {(
   *  (<T extends Node>(node: Parent, index: Node | number, test: import('unist-util-is').PredicateTest<T>) => T | null) &
   *  ((node: Parent, index: Node | number, test?: Test) => Node | null)
   * )}
   */
  (
    /**
     * @param {Parent} parent
     * @param {Node | number} index
     * @param {Test} [test]
     * @returns {Node | null}
     */
    function (parent, index, test) {
      const is = convert(test)

      if (!parent || !parent.type || !parent.children) {
        throw new Error('Expected parent node')
      }

      if (typeof index === 'number') {
        if (index < 0 || index === Number.POSITIVE_INFINITY) {
          throw new Error('Expected positive finite number as index')
        }
      } else {
        index = parent.children.indexOf(index)

        if (index < 0) {
          throw new Error('Expected child node or index')
        }
      }

      while (++index < parent.children.length) {
        if (is(parent.children[index], index, parent)) {
          return parent.children[index]
        }
      }

      return null
    }
  )
