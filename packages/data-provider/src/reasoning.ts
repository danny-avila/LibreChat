/**
 * Shortest unbroken base64/base64url run treated as an encoded provider
 * payload instead of reasoning prose. Natural-language reasoning breaks far
 * sooner on whitespace or punctuation, while encrypted reasoning (Bedrock
 * `redactedContent`, Anthropic `redacted_thinking.data`, OpenAI
 * `encrypted_content`, signatures) is one long run of these characters.
 */
const OPAQUE_REASONING_MIN_RUN = 128;
const OPAQUE_REASONING_RUN = new RegExp(`[A-Za-z0-9+/=_-]{${OPAQUE_REASONING_MIN_RUN},}`, 'g');
/** Persisted reasoning is stored inside `<think>` tags; they are not readable content. */
const THINK_TAGS = /<\/?think>/g;

function isPayloadChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 43 ||
    code === 47 ||
    code === 61 ||
    code === 95 ||
    code === 45
  );
}

/**
 * Removes encoded/encrypted provider payloads from reasoning text, keeping only
 * readable prose. Returns an empty string when nothing but the persisted
 * `<think>` wrapper would remain.
 */
export function stripOpaqueReasoning(text: string): string {
  const stripped = text.replace(OPAQUE_REASONING_RUN, '');
  if (stripped.length === text.length) {
    return text;
  }
  return stripped.replace(THINK_TAGS, '').trim().length === 0 ? '' : stripped;
}

/** True when reasoning text has content but none of it is human-readable. */
export function isOpaqueReasoning(text: string): boolean {
  return text.replace(THINK_TAGS, '').trim().length > 0 && stripOpaqueReasoning(text) === '';
}

/** Streaming position of {@link advanceOpaqueReasoning}: an undecided trailing run, or an open payload. */
export interface OpaqueReasoningCursor {
  /** Trailing payload-alphabet characters too short to classify yet. */
  readonly tail: string;
  /** True while the stream is inside a run already long enough to be a payload. */
  readonly opaque: boolean;
}

export const OPAQUE_REASONING_START: OpaqueReasoningCursor = { tail: '', opaque: false };

function isPayloadOnly(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (!isPayloadChar(text.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

/**
 * Feeds one reasoning delta through the payload filter. A payload can arrive
 * split across deltas shorter than the classification threshold, so a trailing
 * run is held in the cursor until a non-payload character settles it; readable
 * words are held only until the next space or punctuation. Once a run is known
 * to be a payload, deltas made only of payload characters continue it, and the
 * first delta with any other character starts fresh, since providers stream a
 * payload and the reasoning after it as separate blocks. Returns the settled
 * readable text, which callers can count and accumulate directly.
 */
export function advanceOpaqueReasoning(
  cursor: OpaqueReasoningCursor,
  delta: string,
): { readable: string; cursor: OpaqueReasoningCursor } {
  if (cursor.opaque && isPayloadOnly(delta)) {
    return { readable: '', cursor };
  }
  const combined = `${cursor.opaque ? '' : cursor.tail}${delta}`;
  let end = combined.length;
  while (end > 0 && isPayloadChar(combined.charCodeAt(end - 1))) {
    end -= 1;
  }
  const trailing = combined.slice(end);
  const readable = combined.slice(0, end).replace(OPAQUE_REASONING_RUN, '');
  if (trailing.length >= OPAQUE_REASONING_MIN_RUN) {
    return { readable, cursor: { tail: '', opaque: true } };
  }
  return { readable, cursor: { tail: trailing, opaque: false } };
}
