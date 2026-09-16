import { escapeHtmlAttribute } from '~/security/html';

/**
 * The shell's own `<title>`. Matched by tag rather than by its current text, so
 * a change to the built-in title does not silently stop the replacement.
 */
const TITLE_ELEMENT = /<title>[\s\S]*?<\/title>/i;

/**
 * Writes the deployment's app title into the HTML shell.
 *
 * The shell ships the built-in title, and the client replaces `document.title`
 * from `startupConfig.appTitle` only once `/api/config` has answered. Every
 * first paint therefore shows the built-in name before the deployment's own
 * arrives — on a slow connection long enough to read, and on every tab a user
 * opens. The server already knows the name when it serves the document, so it
 * says so here and nothing has to be corrected afterwards.
 *
 * `APP_TITLE` is the same value `/api/config` reports, so the two cannot
 * disagree. An unset or blank value leaves the shell untouched, which is the
 * off switch.
 */
export const applyAppTitle = (html: string, appTitle?: string | null): string => {
  const title = typeof appTitle === 'string' ? appTitle.trim() : '';
  if (!title) {
    return html;
  }

  /* Replacement as a function: a `$&` or `$1` in the title is data, and a
     replacement string would have `String.replace` expand it instead. */
  return html.replace(TITLE_ELEMENT, () => `<title>${escapeHtmlAttribute(title)}</title>`);
};
