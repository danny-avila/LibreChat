import type {Literal} from 'hast'

/* eslint-disable @typescript-eslint/consistent-type-definitions */

export interface Raw extends Literal {
  type: 'raw'
}

declare module 'hast' {
  interface RootContentMap {
    raw: Raw
  }

  interface ElementContentMap {
    raw: Raw
  }
}

/* eslint-enable @typescript-eslint/consistent-type-definitions */
