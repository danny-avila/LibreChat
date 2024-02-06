/**
 * Create an extension for `micromark` to enable GFM strikethrough syntax.
 *
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions`, to
 *   enable GFM strikethrough syntax.
 */
export function gfmStrikethrough(
  options?: Options | null | undefined
): Extension
export type Event = import('micromark-util-types').Event
export type Extension = import('micromark-util-types').Extension
export type Resolver = import('micromark-util-types').Resolver
export type State = import('micromark-util-types').State
export type Token = import('micromark-util-types').Token
export type TokenizeContext = import('micromark-util-types').TokenizeContext
export type Tokenizer = import('micromark-util-types').Tokenizer
/**
 * Configuration (optional).
 */
export type Options = {
  /**
   * Whether to support strikethrough with a single tilde.
   *
   * Single tildes work on github.com, but are technically prohibited by the
   * GFM spec.
   */
  singleTilde?: boolean
}
