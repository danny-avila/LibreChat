/**
 * Figure out the alignment of a GFM table.
 *
 * @param {Array<Event>} events
 * @param {number} index
 * @returns {Array<Align>}
 */
export function gfmTableAlign(
  events: Array<import('micromark-util-types').Event>,
  index: number
): Array<Align>
export type Event = import('micromark-util-types').Event
export type Align = 'left' | 'center' | 'right' | 'none'
