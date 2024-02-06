import type {Align} from './lib/infer.js'

export {gfmTableHtml} from './lib/html.js'
export {gfmTable} from './lib/syntax.js'

declare module 'micromark-util-types' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Token {
    _align?: Align[]
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface TokenTypeMap {
    table: 'table'
    tableBody: 'tableBody'
    tableCellDivider: 'tableCellDivider'
    tableContent: 'tableContent'
    tableData: 'tableData'
    tableDelimiter: 'tableDelimiter'
    tableDelimiterFiller: 'tableDelimiterFiller'
    tableDelimiterMarker: 'tableDelimiterMarker'
    tableDelimiterRow: 'tableDelimiterRow'
    tableHead: 'tableHead'
    tableHeader: 'tableHeader'
    tableRow: 'tableRow'
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface CompileData {
    tableAlign?: Align[]
    tableColumn?: number
  }
}
