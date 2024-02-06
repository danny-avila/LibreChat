/**
 * React component to render markdown.
 *
 * @param {ReactMarkdownOptions} options
 * @returns {ReactElement}
 */
export function ReactMarkdown(options: ReactMarkdownOptions): ReactElement
export namespace ReactMarkdown {
  namespace propTypes {
    const children: PropTypes.Requireable<string>
    const className: PropTypes.Requireable<string>
    const allowElement: PropTypes.Requireable<(...args: any[]) => any>
    const allowedElements: PropTypes.Requireable<(string | null | undefined)[]>
    const disallowedElements: PropTypes.Requireable<
      (string | null | undefined)[]
    >
    const unwrapDisallowed: PropTypes.Requireable<boolean>
    const remarkPlugins: PropTypes.Requireable<(object | null | undefined)[]>
    const rehypePlugins: PropTypes.Requireable<(object | null | undefined)[]>
    const sourcePos: PropTypes.Requireable<boolean>
    const rawSourcePos: PropTypes.Requireable<boolean>
    const skipHtml: PropTypes.Requireable<boolean>
    const includeElementIndex: PropTypes.Requireable<boolean>
    const transformLinkUri: PropTypes.Requireable<
      NonNullable<boolean | ((...args: any[]) => any) | null | undefined>
    >
    const linkTarget: PropTypes.Requireable<
      NonNullable<string | ((...args: any[]) => any) | null | undefined>
    >
    const transformImageUri: PropTypes.Requireable<(...args: any[]) => any>
    const components: PropTypes.Requireable<object>
  }
}
export type ReactNode = import('react').ReactNode
export type ReactElement = import('react').ReactElement<{}>
export type PluggableList = import('unified').PluggableList
export type Root = import('hast').Root
export type FilterOptions = import('./rehype-filter.js').Options
export type TransformOptions = import('./ast-to-react.js').Options
export type CoreOptions = {
  children: string
}
export type PluginOptions = {
  remarkPlugins?: import('unified').PluggableList
  rehypePlugins?: import('unified').PluggableList
  remarkRehypeOptions?: import('remark-rehype').Options | undefined
}
export type LayoutOptions = {
  className?: string
}
export type ReactMarkdownOptions = CoreOptions &
  PluginOptions &
  LayoutOptions &
  FilterOptions &
  TransformOptions
export type Deprecation = {
  id: string
  to?: string
}
import PropTypes from 'prop-types'
