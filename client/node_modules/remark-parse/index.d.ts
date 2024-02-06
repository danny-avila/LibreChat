// This wrapper exists because JS in TS can’t export a `@type` of a function.
import type {Root} from 'mdast'
import type {Plugin} from 'unified'
import type {Options} from './lib/index.js'

declare const remarkParse: Plugin<[(Options | undefined)?], string, Root>
export default remarkParse

export type {Options} from './lib/index.js'
