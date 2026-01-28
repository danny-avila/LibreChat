/**
 * Sanitizes LLM-generated chat titles by removing <think>...</think> reasoning blocks.
 *
 * This function strips out all reasoning blocks (with optional attributes and newlines)
 * and returns a clean title. If the result is empty, a fallback is returned.
 *
 * @param rawTitle - The raw LLM-generated title string, potentially containing <think> blocks.
 * @returns A sanitized title string, never empty (fallback used if needed).
 */
export function sanitizeTitle(rawTitle: string): string {
  const DEFAULT_FALLBACK = 'Untitled Conversation';

  // Step 1: Input Validation
  if (!rawTitle || typeof rawTitle !== 'string') {
    return DEFAULT_FALLBACK;
  }

  // Step 2: Build and apply the regex to remove all <think>...</think> blocks
  const thinkBlockRegex = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
  const cleaned = rawTitle.replace(thinkBlockRegex, '');

  // Step 3: Normalize whitespace (collapse multiple spaces/newlines to single space)
  const normalized = cleaned.replace(/\s+/g, ' ');

  // Step 4: Trim leading and trailing whitespace
  const trimmed = normalized.trim();

  // Step 5: Return trimmed result or fallback if empty
  return trimmed.length > 0 ? trimmed : DEFAULT_FALLBACK;
}
