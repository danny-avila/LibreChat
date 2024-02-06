export type {Options} from './lib/index.js'

export {gfmTableFromMarkdown, gfmTableToMarkdown} from './lib/index.js'

// Add custom data tracked to turn markdown into a tree.
declare module 'mdast-util-from-markdown' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface CompileData {
    /**
     * Whether we’re currently in a table.
     */
    inTable?: boolean | undefined
  }
}

// Add custom data tracked to turn a syntax tree into markdown.
declare module 'mdast-util-to-markdown' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface ConstructNameMap {
    /**
     * Whole table.
     *
     * ```markdown
     * > | | a |
     *     ^^^^^
     * > | | - |
     *     ^^^^^
     * ```
     */
    table: 'table'

    /**
     * Table cell.
     *
     * ```markdown
     * > | | a |
     *     ^^^^^
     *   | | - |
     * ```
     */
    tableCell: 'tableCell'

    /**
     * Table row.
     *
     * ```markdown
     * > | | a |
     *     ^^^^^
     *   | | - |
     * ```
     */
    tableRow: 'tableRow'
  }
}

// Note: `Table` is exposed from `@types/mdast`.
