import { useMemo } from 'react';
import parseJsonField from './parseJsonField';

/**
 * The model-authored `intent` label for a tool call: one sentence, injected
 * as the FIRST property of the tool's schema (SDK-native or host-injected),
 * so it is the first key providers stream in the args. `parseJsonField`'s
 * partial-JSON fallback reads it from the streaming args string as it is
 * typed, before the rest of the args exist — which is what lets a card show
 * it as the call's live status label. Returns undefined until any non-empty
 * text has streamed, so callers can fall back to their generic label.
 *
 * The label persists unchanged when the call settles: completion is a UI
 * state (the shimmer stopping), not a tense change (see `applyOutcome` in
 * `@librechat/agents` for why there is deliberately no rewrite).
 */
export function useToolCallIntent(args?: string | Record<string, unknown>): string | undefined {
  return useMemo(() => {
    if (typeof args === 'object' && args !== null) {
      const value = args.intent;
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed === '' ? undefined : trimmed;
    }
    const intent = parseJsonField(args, 'intent').trim();
    return intent === '' ? undefined : intent;
  }, [args]);
}
