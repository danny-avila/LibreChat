import { ContentTypes } from 'librechat-data-provider';

import type { TMessageContentParts } from 'librechat-data-provider';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object';

const readText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value) && typeof value.value === 'string') {
    return value.value;
  }
  return null;
};

const writeText = (part: Record<string, unknown>, text: string): Record<string, unknown> =>
  isRecord(part.text) ? { ...part, text: { ...part.text, value: text } } : { ...part, text };

/**
 * Cuts persisted assistant text down to what the caller actually heard.
 *
 * In text chat, generated means seen, so the DB write is authoritative. Under barge-in the
 * two come apart: the model may have finished a paragraph while the caller only heard its
 * first clause. Left unreconciled, `BaseClient` rebuilds the next turn from words that were
 * never spoken, and the divergence compounds with every interruption.
 *
 * `spokenCharacters` counts characters of the *source* text — the worker maps LiveKit's
 * playback position back through its speech filter before calling, because what was
 * synthesized is a rewrite of the markdown, not a prefix of it.
 *
 * Truncation applies across text parts in order; non-text parts (tool calls, reasoning) are
 * preserved untouched, since they are not spoken and are not what the caller is reacting to.
 */
export const truncateSpokenContent = (
  content: TMessageContentParts[],
  spokenCharacters: number,
): TMessageContentParts[] => {
  if (!Array.isArray(content) || spokenCharacters < 0) {
    return content;
  }

  let remaining = spokenCharacters;

  return content.map((part) => {
    if (!isRecord(part) || part.type !== ContentTypes.TEXT) {
      return part;
    }

    const text = readText(part.text);
    if (text === null) {
      return part;
    }

    if (remaining >= text.length) {
      remaining -= text.length;
      return part;
    }

    const kept = text.slice(0, Math.max(remaining, 0));
    remaining = 0;
    return writeText(part, kept) as TMessageContentParts;
  });
};
