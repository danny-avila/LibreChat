import { logger } from '@librechat/data-schemas';
import {
  HookRegistry,
  redactSensitiveText,
  type SensitivePattern,
  type PatternMatch,
} from '@librechat/agents';
import {
  selectStarterPatterns,
  type MessagePiiFilterConfig,
  type MessagePiiFilterClientConfig,
} from 'librechat-data-provider';
import type { UserPromptSubmitHookOutput } from '@librechat/agents';

/**
 * Mirrors the `.default('[REDACTED]')` on `messagePiiFilterSchema`
 * (packages/data-provider/src/config.ts). Coalesced at every helper
 * entry point because the LibreChat config loader keeps the raw YAML
 * object instead of applying Zod parsed defaults back to it, so an
 * operator who omits `redactionText` ends up with `undefined` here at
 * runtime even though the schema documents a default.
 */
const DEFAULT_PII_REDACTION_TEXT = '[REDACTED]';

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

  const redactionText = config.redactionText ?? DEFAULT_PII_REDACTION_TEXT;
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
  return redactSensitiveText(text, {
    patterns,
    redactionText: config.redactionText ?? DEFAULT_PII_REDACTION_TEXT,
  });
}

/**
 * Build the browser-safe wire format of the configured filter for the
 * startup config endpoint. Returns undefined when no patterns would be
 * selected so the client-side hook can no-op cleanly.
 */
export function serializeMessagePiiFilterForClient(
  config: MessagePiiFilterConfig | undefined,
): MessagePiiFilterClientConfig | undefined {
  if (config == null) {
    return undefined;
  }
  const patterns = buildPatternList(config);
  if (patterns.length === 0) {
    return undefined;
  }
  return {
    onMatch: config.onMatch,
    redactionText: config.redactionText ?? DEFAULT_PII_REDACTION_TEXT,
    patterns: patterns.map((p) => ({
      id: p.id,
      label: p.label,
      source: p.pattern.source,
      flags: p.pattern.flags,
    })),
  };
}

/**
 * Walk an OpenAI-style messages array and apply PII redaction to user
 * message content in place. Used by the OpenAI-compatible and
 * Responses agent controllers, which receive a messages array instead
 * of the chat endpoint's single `req.body.text`.
 *
 * Handles both content shapes: plain strings and arrays of content
 * parts (text, image_url, etc.). Only `text`-bearing parts are
 * scrubbed. Mutates the array in place and returns the aggregated
 * match set so the caller can choose the mode reaction (HTTP 400 for
 * block, log for warn/silent).
 */
export function applyMessagePiiRedactionToMessages(
  messages: Array<{
    role?: string;
    content?: string | Array<{ type?: string; text?: string; [key: string]: unknown }>;
  }>,
  config: MessagePiiFilterConfig | undefined,
): { matches: PatternMatch[] } {
  if (config == null || !Array.isArray(messages) || messages.length === 0) {
    return { matches: [] };
  }
  const aggregate = new Map<string, PatternMatch>();
  const accumulate = (text: string): string => {
    const result = applyMessagePiiRedaction(text, config);
    for (const m of result.matches) {
      const prior = aggregate.get(m.patternId);
      if (prior == null) {
        aggregate.set(m.patternId, { ...m });
      } else {
        prior.count += m.count;
      }
    }
    return result.text;
  };

  for (const msg of messages) {
    if (msg == null || msg.role !== 'user') {
      continue;
    }
    if (typeof msg.content === 'string') {
      msg.content = accumulate(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part != null && typeof part.text === 'string') {
          part.text = accumulate(part.text);
        }
      }
    }
  }
  return { matches: Array.from(aggregate.values()) };
}
