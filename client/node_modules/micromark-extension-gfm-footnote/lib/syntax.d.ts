/**
 * Create an extension for `micromark` to enable GFM footnote syntax.
 *
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions` to
 *   enable GFM footnote syntax.
 */
export function gfmFootnote(): Extension
export type Event = import('micromark-util-types').Event
export type Exiter = import('micromark-util-types').Exiter
export type Extension = import('micromark-util-types').Extension
export type Resolver = import('micromark-util-types').Resolver
export type State = import('micromark-util-types').State
export type Token = import('micromark-util-types').Token
export type TokenizeContext = import('micromark-util-types').TokenizeContext
export type Tokenizer = import('micromark-util-types').Tokenizer
