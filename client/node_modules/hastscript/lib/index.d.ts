export {h} from './html.js'
export {s} from './svg.js'
/**
 * Acceptable child value.
 */
export type Child = import('./core.js').HChild
/**
 * Acceptable value for element properties.
 */
export type Properties = import('./core.js').HProperties
/**
 * Result from a `h` (or `s`) call.
 */
export type Result = import('./core.js').HResult
