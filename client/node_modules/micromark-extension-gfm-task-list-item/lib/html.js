/**
 * @typedef {import('micromark-util-types').HtmlExtension} HtmlExtension
 */

// To do: next major: expose function to make extension.

/**
 * Extension for `micromark` that can be passed in `htmlExtensions` to
 * support GFM task list items when serializing to HTML.
 *
 * @type {HtmlExtension}
 */
export const gfmTaskListItemHtml = {
  enter: {
    taskListCheck() {
      this.tag('<input type="checkbox" disabled="" ')
    }
  },
  exit: {
    taskListCheck() {
      this.tag('/>')
    },
    taskListCheckValueChecked() {
      this.tag('checked="" ')
    }
  }
}
