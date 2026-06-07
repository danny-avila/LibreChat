/**
 * Starter PII regex catalog. Patterns ported from LibreChat#13561's
 * winston log redaction (`packages/data-schemas/src/config/parsers.ts`),
 * which already had production CI coverage there. These are the
 * defaults the `messagePiiFilter` ships with; operators can subset
 * them via `starterPatterns: [ids...]` or add their own under
 * `customPatterns` in `librechat.yaml`.
 *
 * Each pattern's first capture group is the visible prefix that
 * survives redaction (so trace/log readers can still tell which
 * family of secret matched). All patterns use the `g` flag, required
 * by the agents-side scrubber to scan past the first match.
 */

export type PiiPattern = {
  id: string;
  label: string;
  pattern: RegExp;
};

/**
 * Lower-false-positive starter set. Enabled by default when the
 * messagePiiFilter section is present and `starterPatterns` is omitted.
 */
export const STARTER_PII_PATTERNS: PiiPattern[] = [
  {
    id: 'sk_prefix',
    label: 'sk- prefix token (OpenAI/Anthropic/Langfuse/etc.)',
    pattern: /\b(sk-)[a-zA-Z0-9_-]+/g,
  },
  {
    id: 'bearer_header',
    label: 'Bearer token',
    pattern: /\b(Bearer )[^\s"']+/gi,
  },
  {
    id: 'api_key_header',
    label: 'api-key header',
    pattern: /\b(api-key:?\s+)[^\s"']+/gi,
  },
];

/**
 * Patterns that are useful but high-false-positive in prompt contexts:
 * `?key=value` and `?api_key=…` match normal sentences in code-help
 * conversations. Available by id but NOT in the default starter set.
 * operators opt in explicitly via `starterPatterns: [api_key_query, ...]`.
 */
export const OPT_IN_PII_PATTERNS: PiiPattern[] = [
  {
    id: 'api_key_query',
    label: 'api_key URL param',
    pattern: /\b(api_key=)[^\s"'&]+/gi,
  },
  {
    id: 'key_query',
    label: 'key URL param',
    pattern: /\b(key=)[^\s"'&]+/g,
  },
];

const ALL_PII_PATTERNS: PiiPattern[] = [...STARTER_PII_PATTERNS, ...OPT_IN_PII_PATTERNS];

export const STARTER_PATTERN_IDS = STARTER_PII_PATTERNS.map((p) => p.id);

const PATTERN_BY_ID = new Map<string, PiiPattern>(ALL_PII_PATTERNS.map((p) => [p.id, p]));

/**
 * Picks patterns from the starter + opt-in catalog by id. Returns a
 * fresh array so callers can mutate without affecting module state.
 * Pass `undefined` for the default starter set; pass explicit ids to
 * select from both starter and opt-in patterns. Unknown ids are
 * silently dropped.
 */
export function selectStarterPatterns(ids?: string[]): PiiPattern[] {
  if (ids == null) {
    return [...STARTER_PII_PATTERNS];
  }
  const selected: PiiPattern[] = [];
  for (const id of ids) {
    const entry = PATTERN_BY_ID.get(id);
    if (entry != null) {
      selected.push(entry);
    }
  }
  return selected;
}
