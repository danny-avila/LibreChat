/**
 * Shortest unbroken base64/base64url run treated as an encoded provider
 * payload instead of reasoning prose. Natural-language reasoning breaks far
 * sooner on whitespace or punctuation, while encrypted reasoning (Bedrock
 * `redactedContent`, Anthropic `redacted_thinking.data`, OpenAI
 * `encrypted_content`, signatures) is one long run of these characters.
 */
const OPAQUE_REASONING_MIN_RUN = 128;
const OPAQUE_REASONING_RUN = new RegExp(`[A-Za-z0-9+/=_-]{${OPAQUE_REASONING_MIN_RUN},}`, 'g');

/** Removes encoded/encrypted provider payloads from reasoning text, keeping only readable prose. */
export function stripOpaqueReasoning(text: string): string {
  return text.replace(OPAQUE_REASONING_RUN, '');
}

/** True when reasoning text has content but none of it is human-readable. */
export function isOpaqueReasoning(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && stripOpaqueReasoning(trimmed).trim().length === 0;
}
