/**
 * Escapes mhchem package notation in LaTeX by converting single dollar delimiters to double dollars
 * and escaping backslashes in mhchem commands.
 *
 * @param text - The input text containing potential mhchem notation
 * @returns The processed text with properly escaped mhchem notation
 *
 * @example
 * // Returns "$$\\ce{H2O}$$"
 * escapeMhchem("$\\ce{H2O}$")
 *
 * @example
 * // Returns "$$\\pu{123 kJ/mol}$$"
 * escapeMhchem("$\\pu{123 kJ/mol}$")
 */
export function escapeMhchem(text: string) {
  return text
    .replace(/\$\\ce\{[^}]*\}\$/g, (match) => `$${match}$`) // $\\ce{...} -> $$\\ce{...}$$
    .replace(/\$\\pu\{[^}]*\}\$/g, (match) => `$${match}$`) // $\\pu{...} -> $$\\pu{...}$$
    .replaceAll('$\\ce{', '$\\\\ce{')
    .replaceAll('$\\pu{', '$\\\\pu{');
}

/**
  Escape currency dollar signs
  Matches: $ followed by digits with optional thousands separators and decimal places
  Does not match: already escaped \$, double $$, or $ followed by letters (e.g., $2n)
   */
const currencyRegex = /(?<![\\$])\$(?!\$)(?=\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s|$|[^a-zA-Z\d]))/g;

/**
 * Preprocesses LaTeX content by escaping currency indicators and converting single dollar math delimiters.
 * @param content The input string containing LaTeX expressions.
 * @returns The processed string with escaped currency indicators and converted math delimiters.
 */
export function preprocessLaTeX(content: string): string {
  if (!content.includes('$')) return content;
  let processed = escapeMhchem(content);
  processed = processed.replace(currencyRegex, '\\$');
  processed = processed.replace(/(?<![\\$])\$*(?<![\\$])\$/g, (match) => `$${match}$`);
  return processed;
}
