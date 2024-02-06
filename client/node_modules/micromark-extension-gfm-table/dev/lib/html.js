/**
 * @typedef {import('micromark-util-types').HtmlExtension} HtmlExtension
 */

/**
 * @typedef {import('./infer.js').Align} Align
 */

import {ok as assert} from 'uvu/assert'

const alignment = {
  none: '',
  left: ' align="left"',
  right: ' align="right"',
  center: ' align="center"'
}

// To do: next major: expose functions.
// To do: next major: use `infer` here, when all events are exposed.

/**
 * Extension for `micromark` that can be passed in `htmlExtensions` to support
 * GFM tables when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmTableHtml = {
  enter: {
    table(token) {
      const tableAlign = token._align
      assert(tableAlign, 'expected `_align`')
      this.lineEndingIfNeeded()
      this.tag('<table>')
      this.setData('tableAlign', tableAlign)
    },
    tableBody() {
      this.tag('<tbody>')
    },
    tableData() {
      const tableAlign = this.getData('tableAlign')
      const tableColumn = this.getData('tableColumn')
      assert(tableAlign, 'expected `tableAlign`')
      assert(typeof tableColumn === 'number', 'expected `tableColumn`')
      const align = alignment[tableAlign[tableColumn]]

      if (align === undefined) {
        // Capture results to ignore them.
        this.buffer()
      } else {
        this.lineEndingIfNeeded()
        this.tag('<td' + align + '>')
      }
    },
    tableHead() {
      this.lineEndingIfNeeded()
      this.tag('<thead>')
    },
    tableHeader() {
      const tableAlign = this.getData('tableAlign')
      const tableColumn = this.getData('tableColumn')
      assert(tableAlign, 'expected `tableAlign`')
      assert(typeof tableColumn === 'number', 'expected `tableColumn`')
      const align = alignment[tableAlign[tableColumn]]
      this.lineEndingIfNeeded()
      this.tag('<th' + align + '>')
    },
    tableRow() {
      this.setData('tableColumn', 0)
      this.lineEndingIfNeeded()
      this.tag('<tr>')
    }
  },
  exit: {
    // Overwrite the default code text data handler to unescape escaped pipes when
    // they are in tables.
    codeTextData(token) {
      let value = this.sliceSerialize(token)

      if (this.getData('tableAlign')) {
        value = value.replace(/\\([\\|])/g, replace)
      }

      this.raw(this.encode(value))
    },
    table() {
      this.setData('tableAlign')
      // Note: we don’t set `slurpAllLineEndings` anymore, in delimiter rows,
      // but we do need to reset it to match a funky newline GH generates for
      // list items combined with tables.
      this.setData('slurpAllLineEndings')
      this.lineEndingIfNeeded()
      this.tag('</table>')
    },
    tableBody() {
      this.lineEndingIfNeeded()
      this.tag('</tbody>')
    },
    tableData() {
      const tableAlign = this.getData('tableAlign')
      const tableColumn = this.getData('tableColumn')
      assert(tableAlign, 'expected `tableAlign`')
      assert(typeof tableColumn === 'number', 'expected `tableColumn`')

      if (tableColumn in tableAlign) {
        this.tag('</td>')
        this.setData('tableColumn', tableColumn + 1)
      } else {
        // Stop capturing.
        this.resume()
      }
    },
    tableHead() {
      this.lineEndingIfNeeded()
      this.tag('</thead>')
    },
    tableHeader() {
      const tableColumn = this.getData('tableColumn')
      assert(typeof tableColumn === 'number', 'expected `tableColumn`')
      this.tag('</th>')
      this.setData('tableColumn', tableColumn + 1)
    },
    tableRow() {
      const tableAlign = this.getData('tableAlign')
      let tableColumn = this.getData('tableColumn')
      assert(tableAlign, 'expected `tableAlign`')
      assert(typeof tableColumn === 'number', 'expected `tableColumn`')

      while (tableColumn < tableAlign.length) {
        this.lineEndingIfNeeded()
        this.tag('<td' + alignment[tableAlign[tableColumn]] + '></td>')
        tableColumn++
      }

      this.setData('tableColumn', tableColumn)
      this.lineEndingIfNeeded()
      this.tag('</tr>')
    }
  }
}

/**
 * @param {string} $0
 * @param {string} $1
 * @returns {string}
 */
function replace($0, $1) {
  // Pipes work, backslashes don’t (but can’t escape pipes).
  return $1 === '|' ? $1 : $0
}
