import type { MessagePiiFilterClientConfig } from 'librechat-data-provider';
import type { PiiPatternMatch } from '~/hooks/SSE/piiLabels';

export type ClientRedactResult = {
  text: string;
  matches: PiiPatternMatch[];
};

/**
 * Browser-side mirror of the agents-side `redactSensitiveText`. Replaces
 * regex matches with the first capture group (visible prefix like
 * `sk-`/`Bearer `) followed by the configured redaction text, so chat
 * readers can still tell which family of secret was scrubbed.
 *
 * Reconstructs RegExp objects from the wire-format `{source, flags}`
 * shape each call. Inexpensive given the small starter+custom pattern
 * counts; not memoized to keep the call site free of cache invalidation
 * concerns when the operator changes patterns.
 */
export function redactSensitiveText(
  text: string,
  config: MessagePiiFilterClientConfig,
): ClientRedactResult {
  if (!text || config.patterns.length === 0) {
    return { text, matches: [] };
  }
  const aggregate = new Map<string, PiiPatternMatch>();
  let next = text;
  for (const p of config.patterns) {
    const regex = new RegExp(p.source, p.flags);
    let count = 0;
    next = next.replace(regex, (...args: unknown[]) => {
      count++;
      const groups = args.slice(1, -2);
      const prefix = typeof groups[0] === 'string' ? groups[0] : '';
      return `${prefix}${config.redactionText}`;
    });
    if (count > 0) {
      aggregate.set(p.id, { patternId: p.id, patternLabel: p.label, count });
    }
  }
  return { text: next, matches: Array.from(aggregate.values()) };
}
