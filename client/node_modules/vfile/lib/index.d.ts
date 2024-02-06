export class VFile {
  /**
   * Create a new virtual file.
   *
   * `options` is treated as:
   *
   * *   `string` or `Buffer` — `{value: options}`
   * *   `URL` — `{path: options}`
   * *   `VFile` — shallow copies its data over to the new file
   * *   `object` — all fields are shallow copied over to the new file
   *
   * Path related fields are set in the following order (least specific to
   * most specific): `history`, `path`, `basename`, `stem`, `extname`,
   * `dirname`.
   *
   * You cannot set `dirname` or `extname` without setting either `history`,
   * `path`, `basename`, or `stem` too.
   *
   * @param {Compatible | null | undefined} [value]
   *   File value.
   * @returns
   *   New instance.
   */
  constructor(value?: Compatible | null | undefined)
  /**
   * Place to store custom information (default: `{}`).
   *
   * It’s OK to store custom data directly on the file but moving it to
   * `data` is recommended.
   *
   * @type {Data}
   */
  data: Data
  /**
   * List of messages associated with the file.
   *
   * @type {Array<VFileMessage>}
   */
  messages: Array<VFileMessage>
  /**
   * List of filepaths the file moved between.
   *
   * The first is the original path and the last is the current path.
   *
   * @type {Array<string>}
   */
  history: Array<string>
  /**
   * Base of `path` (default: `process.cwd()` or `'/'` in browsers).
   *
   * @type {string}
   */
  cwd: string
  /**
   * Raw value.
   *
   * @type {Value}
   */
  value: Value
  /**
   * Whether a file was saved to disk.
   *
   * This is used by vfile reporters.
   *
   * @type {boolean}
   */
  stored: boolean
  /**
   * Custom, non-string, compiled, representation.
   *
   * This is used by unified to store non-string results.
   * One example is when turning markdown into React nodes.
   *
   * @type {unknown}
   */
  result: unknown
  /**
   * Source map.
   *
   * This type is equivalent to the `RawSourceMap` type from the `source-map`
   * module.
   *
   * @type {Map | null | undefined}
   */
  map: Map | null | undefined
  /**
   * Set the full path (example: `'~/index.min.js'`).
   *
   * Cannot be nullified.
   * You can set a file URL (a `URL` object with a `file:` protocol) which will
   * be turned into a path with `url.fileURLToPath`.
   *
   * @param {string | URL} path
   */
  set path(arg: string)
  /**
   * Get the full path (example: `'~/index.min.js'`).
   *
   * @returns {string}
   */
  get path(): string
  /**
   * Set the parent path (example: `'~'`).
   *
   * Cannot be set if there’s no `path` yet.
   */
  set dirname(arg: string | undefined)
  /**
   * Get the parent path (example: `'~'`).
   */
  get dirname(): string | undefined
  /**
   * Set basename (including extname) (`'index.min.js'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be nullified (use `file.path = file.dirname` instead).
   */
  set basename(arg: string | undefined)
  /**
   * Get the basename (including extname) (example: `'index.min.js'`).
   */
  get basename(): string | undefined
  /**
   * Set the extname (including dot) (example: `'.js'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be set if there’s no `path` yet.
   */
  set extname(arg: string | undefined)
  /**
   * Get the extname (including dot) (example: `'.js'`).
   */
  get extname(): string | undefined
  /**
   * Set the stem (basename w/o extname) (example: `'index.min'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be nullified (use `file.path = file.dirname` instead).
   */
  set stem(arg: string | undefined)
  /**
   * Get the stem (basename w/o extname) (example: `'index.min'`).
   */
  get stem(): string | undefined
  /**
   * Serialize the file.
   *
   * @param {BufferEncoding | null | undefined} [encoding='utf8']
   *   Character encoding to understand `value` as when it’s a `Buffer`
   *   (default: `'utf8'`).
   * @returns {string}
   *   Serialized file.
   */
  toString(encoding?: BufferEncoding | null | undefined): string
  /**
   * Create a warning message associated with the file.
   *
   * Its `fatal` is set to `false` and `file` is set to the current file path.
   * Its added to `file.messages`.
   *
   * @param {string | Error | VFileMessage} reason
   *   Reason for message, uses the stack and message of the error if given.
   * @param {Node | NodeLike | Position | Point | null | undefined} [place]
   *   Place in file where the message occurred.
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {VFileMessage}
   *   Message.
   */
  message(
    reason: string | Error | VFileMessage,
    place?: Node | NodeLike | Position | Point | null | undefined,
    origin?: string | null | undefined
  ): VFileMessage
  /**
   * Create an info message associated with the file.
   *
   * Its `fatal` is set to `null` and `file` is set to the current file path.
   * Its added to `file.messages`.
   *
   * @param {string | Error | VFileMessage} reason
   *   Reason for message, uses the stack and message of the error if given.
   * @param {Node | NodeLike | Position | Point | null | undefined} [place]
   *   Place in file where the message occurred.
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {VFileMessage}
   *   Message.
   */
  info(
    reason: string | Error | VFileMessage,
    place?: Node | NodeLike | Position | Point | null | undefined,
    origin?: string | null | undefined
  ): VFileMessage
  /**
   * Create a fatal error associated with the file.
   *
   * Its `fatal` is set to `true` and `file` is set to the current file path.
   * Its added to `file.messages`.
   *
   * > 👉 **Note**: a fatal error means that a file is no longer processable.
   *
   * @param {string | Error | VFileMessage} reason
   *   Reason for message, uses the stack and message of the error if given.
   * @param {Node | NodeLike | Position | Point | null | undefined} [place]
   *   Place in file where the message occurred.
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {never}
   *   Message.
   * @throws {VFileMessage}
   *   Message.
   */
  fail(
    reason: string | Error | VFileMessage,
    place?: Node | NodeLike | Position | Point | null | undefined,
    origin?: string | null | undefined
  ): never
}
export type Node = import('unist').Node
export type Position = import('unist').Position
export type Point = import('unist').Point
export type URL = import('./minurl.shared.js').URL
export type Data = import('../index.js').Data
export type Value = import('../index.js').Value
export type NodeLike = Record<string, unknown> & {
  type: string
  position?: Position | undefined
}
/**
 * Encodings supported by the buffer class.
 *
 * This is a copy of the types from Node, copied to prevent Node globals from
 * being needed.
 * Copied from: <https://github.com/DefinitelyTyped/DefinitelyTyped/blob/90a4ec8/types/node/buffer.d.ts#L170>
 */
export type BufferEncoding =
  | 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'base64url'
  | 'latin1'
  | 'binary'
  | 'hex'
/**
 * Things that can be passed to the constructor.
 */
export type Compatible = Options | URL | Value | VFile
/**
 * Set multiple values.
 */
export type VFileCoreOptions = {
  /**
   * Set `value`.
   */
  value?: Value | null | undefined
  /**
   * Set `cwd`.
   */
  cwd?: string | null | undefined
  /**
   * Set `history`.
   */
  history?: Array<string> | null | undefined
  /**
   * Set `path`.
   */
  path?: URL | string | null | undefined
  /**
   * Set `basename`.
   */
  basename?: string | null | undefined
  /**
   * Set `stem`.
   */
  stem?: string | null | undefined
  /**
   * Set `extname`.
   */
  extname?: string | null | undefined
  /**
   * Set `dirname`.
   */
  dirname?: string | null | undefined
  /**
   * Set `data`.
   */
  data?: Data | null | undefined
}
/**
 * Raw source map.
 *
 * See:
 * <https://github.com/mozilla/source-map/blob/58819f0/source-map.d.ts#L15-L23>.
 */
export type Map = {
  /**
   *  Which version of the source map spec this map is following.
   */
  version: number
  /**
   *  An array of URLs to the original source files.
   */
  sources: Array<string>
  /**
   *  An array of identifiers which can be referenced by individual mappings.
   */
  names: Array<string>
  /**
   * The URL root from which all sources are relative.
   */
  sourceRoot?: string | undefined
  /**
   * An array of contents of the original source files.
   */
  sourcesContent?: Array<string> | undefined
  /**
   *  A string of base64 VLQs which contain the actual mappings.
   */
  mappings: string
  /**
   *  The generated file this source map is associated with.
   */
  file: string
}
/**
 * Configuration.
 *
 * A bunch of keys that will be shallow copied over to the new file.
 */
export type Options = {
  [key: string]: unknown
} & VFileCoreOptions
/**
 * Configuration for reporters.
 */
export type ReporterSettings = Record<string, unknown>
/**
 * Type for a reporter.
 */
export type Reporter<Settings extends ReporterSettings> = (
  files: Array<VFile>,
  options: Settings
) => string
import {VFileMessage} from 'vfile-message'
