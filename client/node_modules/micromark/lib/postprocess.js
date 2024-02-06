/**
 * @typedef {import('micromark-util-types').Event} Event
 */

import {subtokenize} from 'micromark-util-subtokenize'

/**
 * @param {Array<Event>} events
 * @returns {Array<Event>}
 */
export function postprocess(events) {
  while (!subtokenize(events)) {
    // Empty
  }
  return events
}
