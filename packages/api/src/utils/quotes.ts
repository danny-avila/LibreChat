/** Max characters kept per quoted excerpt (defense-in-depth over the client cap). */
export const QUOTE_MAX_LENGTH = 1500;

/** Max number of quoted excerpts merged into a single user turn. */
export const QUOTE_MAX_COUNT = 10;

/**
 * Normalizes the `quotes` field off a request body into a clean string array.
 * Trims, drops empties/non-strings, caps each excerpt length and the overall
 * count. Returns `null` when there is nothing usable so callers can skip the
 * merge entirely.
 */
export function getReferencedQuotes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const quotes: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      continue;
    }
    quotes.push(trimmed.slice(0, QUOTE_MAX_LENGTH));
    if (quotes.length >= QUOTE_MAX_COUNT) {
      break;
    }
  }

  return quotes.length > 0 ? quotes : null;
}

/** Formats one excerpt as a Markdown blockquote, prefixing every line. */
function toBlockquote(quote: string): string {
  return quote
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * Renders quoted excerpts as Markdown blockquote blocks, one block per excerpt
 * separated by a blank line. Provider-agnostic (no bespoke tags). Returns an
 * empty string when there are no quotes.
 */
export function formatQuotesAsMarkdown(quotes: string[]): string {
  return quotes.map(toBlockquote).join('\n\n');
}

/**
 * Merges quoted excerpts into a body of text as Markdown blockquotes, prepended
 * before the text so the excerpts read as part of the user turn. Returns the
 * original text unchanged when there are no quotes.
 */
export function mergeQuotedText(text: string, quotes: string[]): string {
  if (quotes.length === 0) {
    return text;
  }

  const block = formatQuotesAsMarkdown(quotes);
  if (block.length === 0) {
    return text;
  }
  const body = text ?? '';
  return body.length > 0 ? `${block}\n\n${body}` : block;
}
