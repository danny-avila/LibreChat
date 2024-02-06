/**
 * Extension for `micromark` that can be passed in `htmlExtensions`, to
 * support GitHub’s weird and useless tagfilter when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmTagfilterHtml: HtmlExtension
export type CompileContext = import('micromark-util-types').CompileContext
export type HtmlExtension = import('micromark-util-types').HtmlExtension
export type Token = import('micromark-util-types').Token
