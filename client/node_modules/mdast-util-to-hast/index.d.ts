import type {Literal} from 'hast'
import type {State} from './lib/state.js'

// Expose types.
export type {State, Handler, Handlers, Options} from './lib/state.js'

// To do: next major: remove.
/**
 * Deprecated: use `State`.
 */
export type H = State

// Expose JS API.
export {handlers as defaultHandlers} from './lib/handlers/index.js'
// To do: next major: remove.
export {one, all} from './lib/state.js'
export {toHast} from './lib/index.js'

// Expose node type.
/**
 * Raw string of HTML embedded into HTML AST.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface Raw extends Literal {
  /**
   * Node type.
   */
  type: 'raw'
}

// Register nodes in content.
declare module 'hast' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface RootContentMap {
    /**
     * Raw string of HTML embedded into HTML AST.
     */
    raw: Raw
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface ElementContentMap {
    /**
     * Raw string of HTML embedded into HTML AST.
     */
    raw: Raw
  }
}
