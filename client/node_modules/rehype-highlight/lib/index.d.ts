/// <reference types="highlight.js" />
/**
 * Plugin to highlight the syntax of code with lowlight (`highlight.js`).
 *
 * @type {import('unified').Plugin<[Options?] | Array<void>, Root>}
 */
export default function rehypeHighlight(
  options?: void | Options | undefined
):
  | void
  | import('unified').Transformer<import('hast').Root, import('hast').Root>
export type LowlightRoot = import('lowlight').Root
export type HighlightSyntax = import('lowlight/lib/core.js').HighlightSyntax
export type Root = import('hast').Root
export type Element = import('hast').Element
export type Node = Root | Root['children'][number]
/**
 * Configuration (optional).
 */
export type Options = {
  /**
   * Prefix to use before classes.
   */
  prefix?: string | undefined
  /**
   * Whether to detect the programming language on code without a language
   * class.
   */
  detect?: boolean | undefined
  /**
   * Scope of languages to check when auto-detecting (default: all languages).
   */
  subset?: string[] | undefined
  /**
   * Swallow errors for missing languages.
   * By default, unregistered syntaxes throw an error when they are used.
   * Pass `true` to swallow those errors and thus ignore code with unknown code
   * languages.
   */
  ignoreMissing?: boolean | undefined
  /**
   * List of plain-text languages.
   * Pass any languages you would like to be kept as plain-text instead of
   * getting highlighted.
   */
  plainText?: string[] | undefined
  /**
   * Register more aliases.
   * Passed to `lowlight.registerAlias`.
   */
  aliases?: Record<string, string | string[]> | undefined
  /**
   * Register more languages.
   * Each key/value pair passed as arguments to `lowlight.registerLanguage`.
   */
  languages?: Record<string, import('highlight.js').LanguageFn> | undefined
}
