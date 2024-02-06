import type {OnEnterError} from './lib/index.js'

export type {
  CompileContext,
  Encoding,
  Extension,
  Handle,
  OnEnterError,
  OnExitError,
  Options,
  Token,
  Transform,
  Value
} from './lib/index.js'

/**
 * Deprecated: use `OnEnterError`.
 */
// To do: next major: remove.
export type OnError = OnEnterError

/**
 * Interface of tracked data.
 *
 * When working on extensions that use more data, extend the corresponding
 * interface to register their types:
 *
 * ```ts
 * declare module 'mdast-util-from-markdown' {
 *   interface CompileData {
 *     // Register a new field.
 *     mathFlowInside?: boolean | undefined
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface CompileData {
  /**
   * Whether we’re inside a hard break.
   */
  atHardBreak?: boolean | undefined

  /**
   * Current character reference type.
   */
  characterReferenceType?:
    | 'characterReferenceMarkerHexadecimal'
    | 'characterReferenceMarkerNumeric'
    | undefined

  /**
   * Whether a first list item value (`1` in `1. a`) is expected.
   */
  expectingFirstListItemValue?: boolean | undefined

  /**
   * Whether we’re in flow code.
   */
  flowCodeInside?: boolean | undefined

  /**
   * Whether we’re in a reference.
   */
  inReference?: boolean | undefined

  /**
   * Whether we’re expecting a line ending from a setext heading, which can be slurped.
   */
  setextHeadingSlurpLineEnding?: boolean | undefined

  /**
   * Current reference.
   */
  referenceType?: 'collapsed' | 'full' | undefined
}

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    listItem: 'listItem'
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Token {
    _spread?: boolean
  }
}

export {fromMarkdown} from './lib/index.js'
