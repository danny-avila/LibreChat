/**
 * @typedef {import('micromark-util-types').Event} Event
 */

/**
 * @typedef {'left' | 'center' | 'right' | 'none'} Align
 */

/**
 * Figure out the alignment of a GFM table.
 *
 * @param {Array<Event>} events
 * @param {number} index
 * @returns {Array<Align>}
 */
export function gfmTableAlign(events, index) {
  let inDelimiterRow = false
  /** @type {Array<Align>} */
  const align = []
  while (index < events.length) {
    const event = events[index]
    if (inDelimiterRow) {
      if (event[0] === 'enter') {
        // Start of alignment value: set a new column.
        // To do: `markdown-rs` uses `tableDelimiterCellValue`.
        if (event[1].type === 'tableContent') {
          align.push(
            events[index + 1][1].type === 'tableDelimiterMarker'
              ? 'left'
              : 'none'
          )
        }
      }
      // Exits:
      // End of alignment value: change the column.
      // To do: `markdown-rs` uses `tableDelimiterCellValue`.
      else if (event[1].type === 'tableContent') {
        if (events[index - 1][1].type === 'tableDelimiterMarker') {
          const alignIndex = align.length - 1
          align[alignIndex] = align[alignIndex] === 'left' ? 'center' : 'right'
        }
      }
      // Done!
      else if (event[1].type === 'tableDelimiterRow') {
        break
      }
    } else if (event[0] === 'enter' && event[1].type === 'tableDelimiterRow') {
      inDelimiterRow = true
    }
    index += 1
  }
  return align
}
