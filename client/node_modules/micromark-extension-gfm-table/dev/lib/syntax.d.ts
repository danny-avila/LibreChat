/**
 * Extension for `micromark` that can be passed in `extensions` to enable GFM
 * table syntax.
 *
 * @type {Extension}
 */
export const gfmTable: Extension
export type Event = import('micromark-util-types').Event
export type Extension = import('micromark-util-types').Extension
export type Point = import('micromark-util-types').Point
export type Resolver = import('micromark-util-types').Resolver
export type State = import('micromark-util-types').State
export type Token = import('micromark-util-types').Token
export type TokenizeContext = import('micromark-util-types').TokenizeContext
export type Tokenizer = import('micromark-util-types').Tokenizer
/**
 * Cell info.
 */
export type Range = [number, number, number, number]
/**
 * Where we are: `1` for head row, `2` for delimiter row, `3` for body row.
 */
export type RowKind = 0 | 1 | 2 | 3
