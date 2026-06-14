import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

interface TextNode extends Node {
  type: 'text';
  value: string;
}

// "Approximately" tilde: a `~` prefixing a number at a prose boundary — start, whitespace,
// or open bracket — e.g. `~50%`, `~ -3%`, `~$5`. Running on parsed text nodes (never code,
// links, math, or URL destinations) means only real prose is touched. Word-attached and
// closed-number subscripts (`H~2~O`, `a ~2~ b`) are excluded so genuine supersub subscripts
// survive. Markdown decodes `\~` to `~` before this runs, so escaped tildes are covered too.
const APPROX_TILDE_REGEX = /(?<=^|[\s([{])~(?=[ \t]?[-−+]?\$?\d)(?![ \t]?[-−+]?\$?[\d.,]*~)/g;
// U+223C TILDE OPERATOR — renders as a tilde but is not split by remark-supersub.
const TILDE_OPERATOR = '∼';

/**
 * Replaces "approximately" tildes (e.g. `~50%`) in a single text value with the Unicode
 * tilde operator so `remark-supersub` does not pair them into spurious `<sub>` ranges.
 * A backslash escape cannot help — markdown decodes `\~` back to `~` before supersub runs —
 * so the glyph itself must change.
 */
export function normalizeApproxTildes(value: string): string {
  if (value.indexOf('~') === -1) return value;
  return value.replace(APPROX_TILDE_REGEX, TILDE_OPERATOR);
}

/**
 * remark plugin that neutralizes "approximately" tildes in text nodes before
 * `remark-supersub` runs. Operating on the parsed tree means code, links, math, and URL
 * destinations are structurally excluded — none of them are `text` nodes.
 */
export function remarkApproxTilde() {
  return (tree: Node) => {
    visit(tree, 'text', (node) => {
      const textNode = node as TextNode;
      if (typeof textNode.value !== 'string') return;
      textNode.value = normalizeApproxTildes(textNode.value);
    });
  };
}
