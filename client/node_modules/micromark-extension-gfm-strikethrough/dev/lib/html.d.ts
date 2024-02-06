/**
 * @typedef {import('micromark-util-types').HtmlExtension} HtmlExtension
 */
/**
 * Extension for `micromark` that can be passed in `htmlExtensions`, to
 * support GFM strikethrough when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmStrikethroughHtml: HtmlExtension
export type HtmlExtension = import('micromark-util-types').HtmlExtension
