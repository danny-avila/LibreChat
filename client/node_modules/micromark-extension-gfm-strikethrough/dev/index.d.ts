export {gfmStrikethroughHtml} from './lib/html.js'
export {gfmStrikethrough, type Options} from './lib/syntax.js'

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    strikethroughSequence: 'strikethroughSequence'
    strikethroughSequenceTemporary: 'strikethroughSequenceTemporary'
    strikethrough: 'strikethrough'
    strikethroughText: 'strikethroughText'
  }
}
