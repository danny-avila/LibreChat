/**
 * Create a tokenizer.
 * Tokenizers deal with one type of data (e.g., containers, flow, text).
 * The parser is the object dealing with it all.
 * `initialize` works like other constructs, except that only its `tokenize`
 * function is used, in which case it doesn’t receive an `ok` or `nok`.
 * `from` can be given to set the point before the first character, although
 * when further lines are indented, they must be set with `defineSkip`.
 *
 * @param {ParseContext} parser
 * @param {InitialConstruct} initialize
 * @param {Omit<Point, '_bufferIndex' | '_index'> | undefined} [from]
 * @returns {TokenizeContext}
 */
export function createTokenizer(
  parser: ParseContext,
  initialize: InitialConstruct,
  from?: Omit<Point, '_bufferIndex' | '_index'> | undefined
): TokenizeContext
export type Chunk = import('micromark-util-types').Chunk
export type Code = import('micromark-util-types').Code
export type Construct = import('micromark-util-types').Construct
export type ConstructRecord = import('micromark-util-types').ConstructRecord
export type Effects = import('micromark-util-types').Effects
export type InitialConstruct = import('micromark-util-types').InitialConstruct
export type ParseContext = import('micromark-util-types').ParseContext
export type Point = import('micromark-util-types').Point
export type State = import('micromark-util-types').State
export type Token = import('micromark-util-types').Token
export type TokenType = import('micromark-util-types').TokenType
export type TokenizeContext = import('micromark-util-types').TokenizeContext
export type Restore = () => void
export type Info = {
  restore: Restore
  from: number
}
/**
 * Handle a successful run.
 */
export type ReturnHandle = (construct: Construct, info: Info) => void
