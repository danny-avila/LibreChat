/**
 * Message.
 */
export class VFileMessage extends Error {
  /**
   * Create a message for `reason` at `place` from `origin`.
   *
   * When an error is passed in as `reason`, the `stack` is copied.
   *
   * @param {string | Error | VFileMessage} reason
   *   Reason for message, uses the stack and message of the error if given.
   *
   *   > 👉 **Note**: you should use markdown.
   * @param {Node | NodeLike | Position | Point | null | undefined} [place]
   *   Place in file where the message occurred.
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns
   *   Instance of `VFileMessage`.
   */
  constructor(
    reason: string | Error | VFileMessage,
    place?: Node | NodeLike | Position | Point | null | undefined,
    origin?: string | null | undefined
  )
  /**
   * Stack of message.
   *
   * This is used by normal errors to show where something happened in
   * programming code, irrelevant for `VFile` messages,
   *
   * @type {string}
   */
  stack: string
  /**
   * Reason for message.
   *
   * > 👉 **Note**: you should use markdown.
   *
   * @type {string}
   */
  reason: string
  /**
   * State of problem.
   *
   * * `true` — marks associated file as no longer processable (error)
   * * `false` — necessitates a (potential) change (warning)
   * * `null | undefined` — for things that might not need changing (info)
   *
   * @type {boolean | null | undefined}
   */
  fatal: boolean | null | undefined
  /**
   * Starting line of error.
   *
   * @type {number | null}
   */
  line: number | null
  /**
   * Starting column of error.
   *
   * @type {number | null}
   */
  column: number | null
  /**
   * Full unist position.
   *
   * @type {Position | null}
   */
  position: Position | null
  /**
   * Namespace of message (example: `'my-package'`).
   *
   * @type {string | null}
   */
  source: string | null
  /**
   * Category of message (example: `'my-rule'`).
   *
   * @type {string | null}
   */
  ruleId: string | null
  /**
   * Path of a file (used throughout the `VFile` ecosystem).
   *
   * @type {string | null}
   */
  file: string | null
  /**
   * Specify the source value that’s being reported, which is deemed
   * incorrect.
   *
   * @type {string | null}
   */
  actual: string | null
  /**
   * Suggest acceptable values that can be used instead of `actual`.
   *
   * @type {Array<string> | null}
   */
  expected: Array<string> | null
  /**
   * Link to docs for the message.
   *
   * > 👉 **Note**: this must be an absolute URL that can be passed as `x`
   * > to `new URL(x)`.
   *
   * @type {string | null}
   */
  url: string | null
  /**
   * Long form description of the message (you should use markdown).
   *
   * @type {string | null}
   */
  note: string | null
}
export type Node = import('unist').Node
export type Position = import('unist').Position
export type Point = import('unist').Point
export type NodeLike = object & {
  type: string
  position?: Position | undefined
}
