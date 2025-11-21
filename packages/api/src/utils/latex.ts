/**
 * Unescapes LaTeX preprocessing done by the frontend preprocessLaTeX function.
 * This reverses the escaping of currency dollar signs and other LaTeX transformations.
 *
 * The frontend escapes dollar signs for proper LaTeX rendering (e.g., $14 → \\$14),
 * but the database stores the original unescaped versions. This function reverses
 * that transformation to match database content.
 *
 * @param text - The escaped text from the frontend
 * @returns The unescaped text matching the database format
 */
export function unescapeLaTeX(text: string | null | undefined): string | null | undefined {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Unescape currency dollar signs (\\$ or \$ → $)
  // This is the main transformation done by preprocessLaTeX for currency
  let result = text.replace(/\\\\?\$/g, '$');

  // Unescape mhchem notation if present
  // Convert $$\\ce{...}$$ back to $\ce{...}$
  result = result.replace(/\$\$\\\\ce\{([^}]*)\}\$\$/g, '$\\ce{$1}$');
  result = result.replace(/\$\$\\\\pu\{([^}]*)\}\$\$/g, '$\\pu{$1}$');

  return result;
}
