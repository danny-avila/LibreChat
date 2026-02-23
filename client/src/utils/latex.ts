// Pre-compile all regular expressions for better performance
const MHCHEM_CE_REGEX = /\$\\ce\{/g;
const MHCHEM_PU_REGEX = /\$\\pu\{/g;
const MHCHEM_CE_ESCAPED_REGEX = /\$\\\\ce\{[^}]*\}\$/g;
const MHCHEM_PU_ESCAPED_REGEX = /\$\\\\pu\{[^}]*\}\$/g;
const CURRENCY_REGEX =
  /(?<![\\$])\$(?!\$)(?=\d+(?:,\d{3})*(?:\.\d+)?(?:[KMBkmb])?(?:\s|$|[^a-zA-Z\d]))/g;
const SINGLE_DOLLAR_REGEX = /(?<!\\)\$(?!\$)((?:[^$\n]|\\[$])+?)(?<!\\)(?<!`)\$(?!\$)/g;
const LATEX_COMMAND_REGEX = /\\[a-zA-Z]+/;
const LATEX_OPERATOR_REGEX = /[\^_]/;
const NUMERIC_ARITHMETIC_REGEX = /\d\s*[+\-*/×xX]\s*\d/;
const VARIABLE_ARITHMETIC_REGEX = /[a-zA-Z]\s*[+\-*/=]|[+\-*/=]\s*[a-zA-Z]/;
const NUMERIC_SYMBOL_TERM_REGEX = /^\d+\s*[a-zA-Z][a-zA-Z0-9_]*$/;
const LEADING_NUMBER_REGEX = /^(\d+(?:,\d{3})*(?:\.\d+)?)(.*)$/;
const CURRENCY_ABBREVIATION_REGEX = /^[kmb]$/i;
const NUMERIC_OPERATOR_TAIL_REGEX = /^[+\-*/×xX^_]\s*(?:\d|[a-zA-Z]|\\|{)/;
const NUMERIC_COMMAND_TAIL_REGEX = /^\\[a-zA-Z]+/;

/**
 * Escapes mhchem package notation in LaTeX by converting single dollar delimiters to double dollars
 * and escaping backslashes in mhchem commands.
 *
 * @param text - The input text containing potential mhchem notation
 * @returns The processed text with properly escaped mhchem notation
 */
function escapeMhchem(text: string): string {
  // First escape the backslashes in mhchem commands
  let result = text.replace(MHCHEM_CE_REGEX, '$\\\\ce{');
  result = result.replace(MHCHEM_PU_REGEX, '$\\\\pu{');

  // Then convert single dollar mhchem to double dollar
  result = result.replace(MHCHEM_CE_ESCAPED_REGEX, (match) => `$${match}$`);
  result = result.replace(MHCHEM_PU_ESCAPED_REGEX, (match) => `$${match}$`);

  return result;
}

/**
 * Efficiently finds all code block regions in the content
 * @param content The content to analyze
 * @returns Array of code block regions [start, end]
 */
function findCodeBlockRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  let inlineStart = -1;
  let multilineStart = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    // Check for multiline code blocks
    if (
      char === '`' &&
      i + 2 < content.length &&
      content[i + 1] === '`' &&
      content[i + 2] === '`'
    ) {
      if (multilineStart === -1) {
        multilineStart = i;
        i += 2; // Skip the next two backticks
      } else {
        regions.push([multilineStart, i + 2]);
        multilineStart = -1;
        i += 2;
      }
    }
    // Check for inline code blocks (only if not in multiline)
    else if (char === '`' && multilineStart === -1) {
      if (inlineStart === -1) {
        inlineStart = i;
      } else {
        regions.push([inlineStart, i]);
        inlineStart = -1;
      }
    }
  }

  return regions;
}

/**
 * Checks if a position is inside any code block region using binary search
 * @param position The position to check
 * @param codeRegions Array of code block regions
 * @returns True if position is inside a code block
 */
function isInCodeBlock(position: number, codeRegions: Array<[number, number]>): boolean {
  let left = 0;
  let right = codeRegions.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const [start, end] = codeRegions[mid];

    if (position >= start && position <= end) {
      return true;
    } else if (position < start) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return false;
}

/**
 * Heuristically identifies if the inner text between dollar delimiters looks like math.
 */
function looksLikeMathExpression(inner: string): boolean {
  const text = inner.trim();
  if (!text) {
    return false;
  }

  const leadingNumberMatch = text.match(LEADING_NUMBER_REGEX);
  if (leadingNumberMatch) {
    // Numeric-leading symbolic terms like 2n or 3x are common math snippets.
    if (NUMERIC_SYMBOL_TERM_REGEX.test(text)) {
      const symbolPart = text.replace(/^\d+\s*/, '');
      if (!CURRENCY_ABBREVIATION_REGEX.test(symbolPart)) {
        return true;
      }
    }

    // For numeric-leading content, only treat as math when the number is followed
    // by an explicit math operator/command, not by prose or closing braces.
    const tail = leadingNumberMatch[2].trimStart();
    return NUMERIC_OPERATOR_TAIL_REGEX.test(tail) || NUMERIC_COMMAND_TAIL_REGEX.test(tail);
  }

  return (
    LATEX_COMMAND_REGEX.test(text) ||
    LATEX_OPERATOR_REGEX.test(text) ||
    NUMERIC_ARITHMETIC_REGEX.test(text) ||
    VARIABLE_ARITHMETIC_REGEX.test(text)
  );
}

/**
 * Builds a cache of single-dollar opening delimiters and whether each pair looks like math.
 * This avoids repeated linear scans for each currency-like match.
 */
function buildMathOpeningCache(content: string): Map<number, boolean> {
  const mathOpeningCache = new Map<number, boolean>();
  SINGLE_DOLLAR_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SINGLE_DOLLAR_REGEX.exec(content)) !== null) {
    mathOpeningCache.set(match.index, looksLikeMathExpression(match[1]));
  }

  return mathOpeningCache;
}

/**
 * Preprocesses LaTeX content by escaping currency indicators and converting single dollar math delimiters.
 * Optimized for high-frequency execution.
 * @param content The input string containing LaTeX expressions.
 * @returns The processed string with escaped currency indicators and converted math delimiters.
 */
export function preprocessLaTeX(content: string): string {
  // Early return for most common case
  if (!content.includes('$')) return content;

  // Process mhchem first (usually rare, so check if needed)
  let processed = content;
  if (content.includes('\\ce{') || content.includes('\\pu{')) {
    processed = escapeMhchem(content);
  }

  // Find all code block regions once
  const codeRegions = findCodeBlockRegions(processed);
  const mathOpeningCache = buildMathOpeningCache(processed);

  // First pass: escape currency dollar signs
  const parts: string[] = [];
  let lastIndex = 0;

  // Reset regex for reuse
  CURRENCY_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CURRENCY_REGEX.exec(processed)) !== null) {
    if (!isInCodeBlock(match.index, codeRegions) && !mathOpeningCache.get(match.index)) {
      parts.push(processed.substring(lastIndex, match.index));
      parts.push('\\$');
      lastIndex = match.index + 1;
    }
  }
  parts.push(processed.substring(lastIndex));
  processed = parts.join('');

  // Second pass: convert single dollar delimiters to double dollars
  const result: string[] = [];
  lastIndex = 0;

  // Reset regex for reuse
  SINGLE_DOLLAR_REGEX.lastIndex = 0;

  while ((match = SINGLE_DOLLAR_REGEX.exec(processed)) !== null) {
    if (!isInCodeBlock(match.index, codeRegions)) {
      result.push(processed.substring(lastIndex, match.index));
      result.push(`$$${match[1]}$$`);
      lastIndex = match.index + match[0].length;
    }
  }
  result.push(processed.substring(lastIndex));

  return result.join('');
}
