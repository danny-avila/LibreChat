import { logger } from '@librechat/data-schemas';
import { selectStarterPatterns, type MessagePiiFilterConfig } from 'librechat-data-provider';
import {
  HookRegistry,
  redactSensitiveText,
  type SensitivePattern,
  type PatternMatch,
} from '@librechat/agents';
import type { UserPromptSubmitHookOutput } from '@librechat/agents';

/**
 * Per-request match collector. The factory creates one for each
 * request; the controller reads it after `processStream` resolves to
 * surface matches to the client (e.g. via SSE for `warn` mode) or to
 * log them.
 */
export type PiiMatchCollector = {
  matches: PatternMatch[];
};

export type CreatePiiFilterOptions = {
  /**
   * Optional pre-allocated collector. The factory pushes matches into
   * this object's `matches` array as the hook fires. Default: a fresh
   * collector returned alongside the registry.
   */
  collector?: PiiMatchCollector;
  /**
   * Invoked from inside the hook (while the response is still open)
   * with the matches detected for this prompt. Used by the controller
   * to emit a `pii_matches` SSE event for warn mode before
   * processStream closes the response.
   */
  onMatches?: (matches: PatternMatch[]) => void;
};

export type CreatePiiFilterResult = {
  registry: HookRegistry;
  collector: PiiMatchCollector;
};

export function buildPatternList(config: MessagePiiFilterConfig): SensitivePattern[] {
  const starter = selectStarterPatterns(config.starterPatterns).map(
    (p): SensitivePattern => ({
      id: p.id,
      label: p.label,
      pattern: p.pattern,
    }),
  );
  const custom = (config.customPatterns ?? []).map(
    (p): SensitivePattern => ({
      id: p.id,
      label: p.label,
      // Force global flag; redactSensitiveText uses .replace with /g.
      pattern: new RegExp(p.regex, 'g'),
    }),
  );
  return [...starter, ...custom];
}

/**
 * Builds a HookRegistry that registers a single `UserPromptSubmit`
 * hook configured per `messagePiiFilter.onMatch`. Returns `undefined`
 * when the filter is disabled (no config) or selects zero patterns.
 *
 * Mode semantics:
 * - silent: redact + return rewritten prompt
 * - warn:   redact + return rewritten prompt + matches in collector
 *           (controller is expected to surface them to the client)
 * - block:  always block with `decision: 'deny'` on match
 */
export function createMessagePiiFilterHooks(
  config: MessagePiiFilterConfig | undefined,
  options: CreatePiiFilterOptions = {},
): CreatePiiFilterResult | undefined {
  if (config == null) {
    return undefined;
  }

  const patterns = buildPatternList(config);
  if (patterns.length === 0) {
    return undefined;
  }

  const { redactionText } = config;
  const mode = config.onMatch;
  const collector: PiiMatchCollector = options.collector ?? { matches: [] };
  const { onMatches } = options;
  const registry = new HookRegistry();

  registry.register('UserPromptSubmit', {
    hooks: [
      async (input): Promise<UserPromptSubmitHookOutput> => {
        const { text, matches } = redactSensitiveText(input.prompt, {
          patterns,
          redactionText,
        });
        if (matches.length === 0) {
          return {};
        }

        if (mode !== 'silent') {
          collector.matches.push(...matches);
          if (mode === 'warn' && onMatches != null) {
            onMatches(matches);
          }
        }

        if (mode === 'block') {
          logger.info(
            `[messagePiiFilter] blocked send (mode=block, patterns=${matches
              .map((m) => m.patternId)
              .join(',')})`,
          );
          return {
            decision: 'deny',
            reason: 'message_pii_filter_block',
          };
        }

        // silent + warn both redact server-side. The difference is
        // that warn surfaces the matches to the UI via the controller
        // (which reads collector.matches after processStream resolves).
        logger.info(
          `[messagePiiFilter] redacted ${matches.length} match(es) (mode=${mode}, patterns=${matches
            .map((m) => m.patternId)
            .join(',')})`,
        );

        return { updatedPrompt: text };
      },
    ],
  });

  return { registry, collector };
}

/**
 * Apply the configured PII filter directly to a text blob, bypassing
 * the agents hook plumbing. Used by the agents request controller to
 * pre-redact `req.body.text` before the user message is created/saved,
 * so the chat-history display and persisted message both have the
 * redacted text. Mode semantics are interpreted by the caller. This
 * helper just runs the scrubber and returns the result.
 */
export function applyMessagePiiRedaction(
  text: string,
  config: MessagePiiFilterConfig | undefined,
): { text: string; matches: PatternMatch[] } {
  if (config == null || typeof text !== 'string' || text.length === 0) {
    return { text: text ?? '', matches: [] };
  }
  const patterns = buildPatternList(config);
  if (patterns.length === 0) {
    return { text, matches: [] };
  }
  return redactSensitiveText(text, { patterns, redactionText: config.redactionText });
}
