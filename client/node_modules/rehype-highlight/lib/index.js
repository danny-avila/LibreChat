/**
 * @typedef {import('lowlight').Root} LowlightRoot
 * @typedef {import('lowlight/lib/core.js').HighlightSyntax} HighlightSyntax
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').Element} Element
 * @typedef {Root|Root['children'][number]} Node
 *
 * @typedef Options
 *   Configuration (optional).
 * @property {string} [prefix='hljs-']
 *   Prefix to use before classes.
 * @property {boolean} [detect=false]
 *   Whether to detect the programming language on code without a language
 *   class.
 * @property {Array<string>} [subset]
 *   Scope of languages to check when auto-detecting (default: all languages).
 * @property {boolean} [ignoreMissing=false]
 *   Swallow errors for missing languages.
 *   By default, unregistered syntaxes throw an error when they are used.
 *   Pass `true` to swallow those errors and thus ignore code with unknown code
 *   languages.
 * @property {Array<string>} [plainText=[]]
 *   List of plain-text languages.
 *   Pass any languages you would like to be kept as plain-text instead of
 *   getting highlighted.
 * @property {Record<string, string|Array<string>>} [aliases={}]
 *   Register more aliases.
 *   Passed to `lowlight.registerAlias`.
 * @property {Record<string, HighlightSyntax>} [languages={}]
 *   Register more languages.
 *   Each key/value pair passed as arguments to `lowlight.registerLanguage`.
 */

import {lowlight} from 'lowlight'
import {toText} from 'hast-util-to-text'
import {visit} from 'unist-util-visit'

const own = {}.hasOwnProperty

/**
 * Plugin to highlight the syntax of code with lowlight (`highlight.js`).
 *
 * @type {import('unified').Plugin<[Options?] | Array<void>, Root>}
 */
export default function rehypeHighlight(options = {}) {
  const {aliases, languages, prefix, plainText, ignoreMissing, subset, detect} =
    options
  let name = 'hljs'

  if (aliases) {
    lowlight.registerAlias(aliases)
  }

  if (languages) {
    /** @type {string} */
    let key

    for (key in languages) {
      if (own.call(languages, key)) {
        lowlight.registerLanguage(key, languages[key])
      }
    }
  }

  if (prefix) {
    const pos = prefix.indexOf('-')
    name = pos > -1 ? prefix.slice(0, pos) : prefix
  }

  return (tree, file) => {
    // eslint-disable-next-line complexity
    visit(tree, 'element', (node, _, givenParent) => {
      const parent = /** @type {Node?} */ (givenParent)

      if (
        !parent ||
        !('tagName' in parent) ||
        parent.tagName !== 'pre' ||
        node.tagName !== 'code' ||
        !node.properties
      ) {
        return
      }

      const lang = language(node)

      if (
        lang === false ||
        (!lang && !detect) ||
        (lang && plainText && plainText.includes(lang))
      ) {
        return
      }

      if (!Array.isArray(node.properties.className)) {
        node.properties.className = []
      }

      if (!node.properties.className.includes(name)) {
        node.properties.className.unshift(name)
      }

      /** @type {LowlightRoot} */
      let result

      try {
        result = lang
          ? lowlight.highlight(lang, toText(parent), {prefix})
          : lowlight.highlightAuto(toText(parent), {prefix, subset})
      } catch (error) {
        const exception = /** @type {Error} */ (error)
        if (!ignoreMissing || !/Unknown language/.test(exception.message)) {
          file.fail(exception, node, 'rehype-highlight:missing-language')
        }

        return
      }

      if (!lang && result.data.language) {
        node.properties.className.push('language-' + result.data.language)
      }

      if (Array.isArray(result.children) && result.children.length > 0) {
        node.children = result.children
      }
    })
  }
}

/**
 * Get the programming language of `node`.
 *
 * @param {Element} node
 * @returns {false|string|undefined}
 */
function language(node) {
  const className = node.properties && node.properties.className
  let index = -1

  if (!Array.isArray(className)) {
    return
  }

  while (++index < className.length) {
    const value = String(className[index])

    if (value === 'no-highlight' || value === 'nohighlight') {
      return false
    }

    if (value.slice(0, 5) === 'lang-') {
      return value.slice(5)
    }

    if (value.slice(0, 9) === 'language-') {
      return value.slice(9)
    }
  }
}
