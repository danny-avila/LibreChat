/**
 * @typedef {import('micromark-util-types').HtmlExtension} HtmlExtension
 */

// To do: next major: expose function instead of object.

/**
 * Extension for `micromark` that can be passed in `htmlExtensions`, to
 * support GFM strikethrough when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmStrikethroughHtml = {
  enter: {
    strikethrough() {
      this.tag('<del>')
    }
  },
  exit: {
    strikethrough() {
      this.tag('</del>')
    }
  }
}
