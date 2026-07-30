import { useMemo } from 'react';
import parseJsonField from './parseJsonField';

/**
 * Single-line clamp mirroring the SDK's outcome-label bound
 * (`MAX_OUTCOME_CHARS` in `@librechat/agents`): the label is one progress
 * line in UI chrome rendered with `whitespace-nowrap`, so a verbose or
 * malformed model response must not extend across adjacent controls.
 */
const MAX_INTENT_CHARS = 256;

function boundIntentLabel(label: string): string | undefined {
  const singleLine = label.replace(/\s+/g, ' ').trim();
  if (singleLine === '') {
    return undefined;
  }
  if (singleLine.length <= MAX_INTENT_CHARS) {
    return singleLine;
  }
  return `${singleLine.slice(0, MAX_INTENT_CHARS - 1)}…`;
}

/**
 * Whether the args carry `intent` as their FIRST key. The label contract
 * demands first position ("ALWAYS write this field FIRST" — that ordering is
 * the entire streaming mechanism), so requiring it here is what separates
 * the injected label from a tool's own business parameter that merely
 * shares the name (e.g. a CRM tool's `{"q":"acme","intent":"billing"}`),
 * which serializes wherever the model put it.
 */
function isIntentFirstKey(args: string | Record<string, unknown>): boolean {
  if (typeof args === 'object') {
    return Object.keys(args)[0] === 'intent';
  }
  return /^\s*\{\s*"intent"\s*:/.test(args);
}

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
    if (args == null || !isIntentFirstKey(args)) {
      return undefined;
    }
    if (typeof args === 'object') {
      const value = args.intent;
      return typeof value === 'string' ? boundIntentLabel(value) : undefined;
    }
    return boundIntentLabel(parseJsonField(args, 'intent'));
  }, [args]);
}
