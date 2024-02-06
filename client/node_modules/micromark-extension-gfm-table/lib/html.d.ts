/**
 * Extension for `micromark` that can be passed in `htmlExtensions` to support
 * GFM tables when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmTableHtml: HtmlExtension
export type HtmlExtension = import('micromark-util-types').HtmlExtension
export type Align = import('./infer.js').Align
