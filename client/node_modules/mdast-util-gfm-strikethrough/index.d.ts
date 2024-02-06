export {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown
} from './lib/index.js'

// Add custom data tracked to turn a syntax tree into markdown.
declare module 'mdast-util-to-markdown' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface ConstructNameMap {
    /**
     * Whole strikethrough.
     *
     * ```markdown
     * > | ~~a~~
     *     ^^^^^
     * ```
     */
    strikethrough: 'strikethrough'
  }
}
