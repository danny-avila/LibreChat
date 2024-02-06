/**
 * Check if the given value is *inter-element whitespace*.
 *
 * @param {unknown} thing
 *   Thing to check (typically `Node` or `string`).
 * @returns {boolean}
 *   Whether the `value` is inter-element whitespace (`boolean`): consisting of
 *   zero or more of space, tab (`\t`), line feed (`\n`), carriage return
 *   (`\r`), or form feed (`\f`).
 *   If a node is passed it must be a `Text` node, whose `value` field is
 *   checked.
 */
export function whitespace(thing) {
  /** @type {string} */
  const value =
    // @ts-expect-error looks like a node.
    thing && typeof thing === 'object' && thing.type === 'text'
      ? // @ts-expect-error looks like a text.
        thing.value || ''
      : thing

  // HTML whitespace expression.
  // See <https://infra.spec.whatwg.org/#ascii-whitespace>.
  return typeof value === 'string' && value.replace(/[ \t\n\f\r]/g, '') === ''
}
