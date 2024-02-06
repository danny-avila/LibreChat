/**
 * @typedef {import('micromark-util-types').Event} Event
 */
/**
 * @typedef {[number, number, Array<Event>]} Change
 * @typedef {[number, number, number]} Jump
 */
/**
 * Tracks a bunch of edits.
 */
export class EditMap {
  /**
   * Record of changes.
   *
   * @type {Array<Change>}
   */
  map: Array<Change>
  /**
   * Create an edit: a remove and/or add at a certain place.
   *
   * @param {number} index
   * @param {number} remove
   * @param {Array<Event>} add
   * @returns {void}
   */
  add(
    index: number,
    remove: number,
    add: Array<import('micromark-util-types').Event>
  ): void
  /**
   * Done, change the events.
   *
   * @param {Array<Event>} events
   * @returns {void}
   */
  consume(events: Array<import('micromark-util-types').Event>): void
}
export type Event = import('micromark-util-types').Event
export type Change = [
  number,
  number,
  Array<
    [
      'enter' | 'exit',
      import('micromark-util-types').Token,
      import('micromark-util-types').TokenizeContext
    ]
  >
]
export type Jump = [number, number, number]
