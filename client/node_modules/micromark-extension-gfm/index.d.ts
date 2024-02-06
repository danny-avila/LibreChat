/**
 * Create an extension for `micromark` to enable GFM syntax.
 *
 * @param {Options | null | undefined} [options]
 *   Configuration (optional).
 *
 *   Passed to `micromark-extens-gfm-strikethrough`.
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions` to enable GFM
 *   syntax.
 */
export function gfm(options?: Options | null | undefined): Extension
/**
 * Create an extension for `micromark` to support GFM when serializing to HTML.
 *
 * @param {HtmlOptions | null | undefined} [options]
 *   Configuration.
 *
 *   Passed to `micromark-extens-gfm-footnote`.
 * @returns {HtmlExtension}
 *   Extension for `micromark` that can be passed in `htmlExtensions` to
 *   support GFM when serializing to HTML.
 */
export function gfmHtml(options?: HtmlOptions | null | undefined): HtmlExtension
export type HtmlOptions = import('micromark-extension-gfm-footnote').HtmlOptions
export type Options = import('micromark-extension-gfm-strikethrough').Options
export type Extension = import('micromark-util-types').Extension
export type HtmlExtension = import('micromark-util-types').HtmlExtension
