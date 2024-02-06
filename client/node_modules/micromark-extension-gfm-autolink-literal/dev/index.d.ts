export {gfmAutolinkLiteral} from './lib/syntax.js'
export {gfmAutolinkLiteralHtml} from './lib/html.js'

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Token {
    _gfmAutolinkLiteralWalkedInto?: boolean
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    literalAutolink: 'literalAutolink'
    literalAutolinkEmail: 'literalAutolinkEmail'
    literalAutolinkHttp: 'literalAutolinkHttp'
    literalAutolinkWww: 'literalAutolinkWww'
  }
}
