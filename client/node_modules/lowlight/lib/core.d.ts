export namespace lowlight {
  export {highlight}
  export {highlightAuto}
  export {registerLanguage}
  export {registered}
  export {listLanguages}
  export {registerAlias}
}
export type Text = import('hast').Text
export type HighlightResult = import('highlight.js').HighlightResult
export type HighlightOptions = import('highlight.js').HLJSOptions
export type HighlightSyntax = import('highlight.js').LanguageFn
export type HighlightEmitter = import('highlight.js').Emitter
export type Span = {
  type: 'element'
  tagName: 'span'
  properties: {
    className: Array<string>
  }
  children: Array<Span | Text>
}
export type Root = {
  type: 'root'
  data: {
    language: string | null
    relevance: number
  }
  children: Array<Span | Text>
}
export type ExtraOptions = {
  /**
   * List of allowed languages, defaults to all registered languages.
   */
  subset?: Array<string>
}
/**
 * Configuration.
 */
export type Options = {
  /**
   * Class prefix.
   */
  prefix?: string
}
export type AutoOptions = Options & ExtraOptions
/**
 * Highlight `value` (code) as `language` (name).
 *
 * @param {string} language
 *   Programming language name.
 * @param {string} value
 *   Code to highlight.
 * @param {Options} [options={}]
 *   Configuration.
 * @returns {Root}
 *   A hast `Root` node.
 */
declare function highlight(
  language: string,
  value: string,
  options?: Options | undefined
): Root
/**
 * Highlight `value` (code) and guess its programming language.
 *
 * @param {string} value
 *   Code to highlight.
 * @param {AutoOptions} [options={}]
 *   Configuration.
 * @returns {Root}
 *   A hast `Root` node.
 */
declare function highlightAuto(
  value: string,
  options?: AutoOptions | undefined
): Root
/**
 * Register a language.
 *
 * @param {string} language
 *   Programming language name.
 * @param {HighlightSyntax} syntax
 *   `highlight.js` language syntax.
 * @returns {void}
 */
declare function registerLanguage(
  language: string,
  syntax: HighlightSyntax
): void
/**
 * Check whether an `alias` or `language` is registered.
 *
 * @param {string} aliasOrLanguage
 *   Name of a registered language or alias.
 * @returns {boolean}
 *   Whether `aliasOrlanguage` is registered.
 */
declare function registered(aliasOrLanguage: string): boolean
/**
 * List registered languages.
 *
 * @returns {Array<string>}
 *   Names of registered language.
 */
declare function listLanguages(): Array<string>
/**
 * Register aliases for already registered languages.
 *
 * @param {string|Record<string, string|Array<string>>} language
 *   Programming language name or a map of `language`s to `alias`es or `list`s
 * @param {string|Array<string>} [alias]
 *   New aliases for the programming language.
 * @returns {void}
 */
declare const registerAlias: ((
  language: string,
  alias: string | Array<string>
) => void) &
  ((aliases: Record<string, string | Array<string>>) => void)
export {}
