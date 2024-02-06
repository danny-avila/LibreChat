/**
 * @typedef {import('react').ReactNode} ReactNode
 * @typedef {import('react').ReactElement<{}>} ReactElement
 * @typedef {import('unified').PluggableList} PluggableList
 * @typedef {import('hast').Root} Root
 * @typedef {import('./rehype-filter.js').Options} FilterOptions
 * @typedef {import('./ast-to-react.js').Options} TransformOptions
 *
 * @typedef CoreOptions
 * @property {string} children
 *
 * @typedef PluginOptions
 * @property {PluggableList} [remarkPlugins=[]]
 * @property {PluggableList} [rehypePlugins=[]]
 * @property {import('remark-rehype').Options | undefined} [remarkRehypeOptions={}]
 *
 * @typedef LayoutOptions
 * @property {string} [className]
 *
 * @typedef {CoreOptions & PluginOptions & LayoutOptions & FilterOptions & TransformOptions} ReactMarkdownOptions
 *
 * @typedef Deprecation
 * @property {string} id
 * @property {string} [to]
 */

import React from 'react'
import {VFile} from 'vfile'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import PropTypes from 'prop-types'
import {html} from 'property-information'
import rehypeFilter from './rehype-filter.js'
import {childrenToReact} from './ast-to-react.js'

const own = {}.hasOwnProperty
const changelog =
  'https://github.com/remarkjs/react-markdown/blob/main/changelog.md'

/** @type {Record<string, Deprecation>} */
const deprecated = {
  plugins: {to: 'remarkPlugins', id: 'change-plugins-to-remarkplugins'},
  renderers: {to: 'components', id: 'change-renderers-to-components'},
  astPlugins: {id: 'remove-buggy-html-in-markdown-parser'},
  allowDangerousHtml: {id: 'remove-buggy-html-in-markdown-parser'},
  escapeHtml: {id: 'remove-buggy-html-in-markdown-parser'},
  source: {to: 'children', id: 'change-source-to-children'},
  allowNode: {
    to: 'allowElement',
    id: 'replace-allownode-allowedtypes-and-disallowedtypes'
  },
  allowedTypes: {
    to: 'allowedElements',
    id: 'replace-allownode-allowedtypes-and-disallowedtypes'
  },
  disallowedTypes: {
    to: 'disallowedElements',
    id: 'replace-allownode-allowedtypes-and-disallowedtypes'
  },
  includeNodeIndex: {
    to: 'includeElementIndex',
    id: 'change-includenodeindex-to-includeelementindex'
  }
}

/**
 * React component to render markdown.
 *
 * @param {ReactMarkdownOptions} options
 * @returns {ReactElement}
 */
export function ReactMarkdown(options) {
  for (const key in deprecated) {
    if (own.call(deprecated, key) && own.call(options, key)) {
      const deprecation = deprecated[key]
      console.warn(
        `[react-markdown] Warning: please ${
          deprecation.to ? `use \`${deprecation.to}\` instead of` : 'remove'
        } \`${key}\` (see <${changelog}#${deprecation.id}> for more info)`
      )
      delete deprecated[key]
    }
  }

  const processor = unified()
    .use(remarkParse)
    .use(options.remarkPlugins || [])
    .use(remarkRehype, {
      ...options.remarkRehypeOptions,
      allowDangerousHtml: true
    })
    .use(options.rehypePlugins || [])
    .use(rehypeFilter, options)

  const file = new VFile()

  if (typeof options.children === 'string') {
    file.value = options.children
  } else if (options.children !== undefined && options.children !== null) {
    console.warn(
      `[react-markdown] Warning: please pass a string as \`children\` (not: \`${options.children}\`)`
    )
  }

  const hastNode = processor.runSync(processor.parse(file), file)

  if (hastNode.type !== 'root') {
    throw new TypeError('Expected a `root` node')
  }

  /** @type {ReactElement} */
  let result = React.createElement(
    React.Fragment,
    {},
    childrenToReact({options, schema: html, listDepth: 0}, hastNode)
  )

  if (options.className) {
    result = React.createElement('div', {className: options.className}, result)
  }

  return result
}

ReactMarkdown.propTypes = {
  // Core options:
  children: PropTypes.string,
  // Layout options:
  className: PropTypes.string,
  // Filter options:
  allowElement: PropTypes.func,
  allowedElements: PropTypes.arrayOf(PropTypes.string),
  disallowedElements: PropTypes.arrayOf(PropTypes.string),
  unwrapDisallowed: PropTypes.bool,
  // Plugin options:
  remarkPlugins: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.object,
      PropTypes.func,
      PropTypes.arrayOf(
        PropTypes.oneOfType([
          PropTypes.bool,
          PropTypes.string,
          PropTypes.object,
          PropTypes.func,
          PropTypes.arrayOf(
            // prettier-ignore
            // type-coverage:ignore-next-line
            PropTypes.any
          )
        ])
      )
    ])
  ),
  rehypePlugins: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.object,
      PropTypes.func,
      PropTypes.arrayOf(
        PropTypes.oneOfType([
          PropTypes.bool,
          PropTypes.string,
          PropTypes.object,
          PropTypes.func,
          PropTypes.arrayOf(
            // prettier-ignore
            // type-coverage:ignore-next-line
            PropTypes.any
          )
        ])
      )
    ])
  ),
  // Transform options:
  sourcePos: PropTypes.bool,
  rawSourcePos: PropTypes.bool,
  skipHtml: PropTypes.bool,
  includeElementIndex: PropTypes.bool,
  transformLinkUri: PropTypes.oneOfType([PropTypes.func, PropTypes.bool]),
  linkTarget: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
  transformImageUri: PropTypes.func,
  components: PropTypes.object
}
