/**
 * Parse spaces and tabs.
 *
 * There is no `nok` parameter:
 *
 * *   line endings or spaces in markdown are often optional, in which case this
 *     factory can be used and `ok` will be switched to whether spaces were found
 *     or not
 * *   one line ending or space can be detected with
 *     `markdownLineEndingOrSpace(code)` right before using `factoryWhitespace`
 *
 * @param {Effects} effects
 *   Context.
 * @param {State} ok
 *   State switched to when successful.
 * @returns
 *   Start state.
 */
export function factoryWhitespace(
  effects: Effects,
  ok: State
): (
  code: import('micromark-util-types').Code
) => void | import('micromark-util-types').State
export type Effects = import('micromark-util-types').Effects
export type State = import('micromark-util-types').State
