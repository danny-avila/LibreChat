import type { BamlTranscriptEntry, BamlTranscriptToolCall } from '@librechat/agents/baml';
import type { WireFailure } from './protocol';
import {
  MAX_TOOL_RESULT_CHARS,
  MAX_TRANSCRIPT_ENTRIES,
  MAX_TRANSCRIPT_TEXT_CHARS,
  TRANSCRIPT_TOO_LARGE_MESSAGE,
} from './protocol';

/**
 * Turns the port's transcript projection into the two strings the compiled BAML
 * functions declare. Pure and native-free, so the same code runs in the facade,
 * in unit tests, and inside the size gate that must fire BEFORE a worker is
 * created.
 */

export interface TranscriptProjection {
  readonly userMessage: string;
  readonly transcript: string;
}

export type TranscriptResult =
  | { readonly ok: true; readonly value: TranscriptProjection }
  | { readonly ok: false; readonly failure: WireFailure };

const TOOL_ROLE = 'tool';
const USER_ROLE = 'user';

const textOf = (content: unknown): string =>
  typeof content === 'string' ? content : JSON.stringify(content ?? '');

const tooLarge = (): TranscriptResult => ({
  ok: false,
  failure: { code: 'schema_mismatch', message: TRANSCRIPT_TOO_LARGE_MESSAGE },
});

/**
 * One forward pass. Tool calls are registered in a `Map` as their assistant turn
 * is read and resolved when the matching result arrives, so association is O(n)
 * rather than the O(n²) rescan a `find` per tool result would cost — and the
 * transcript is the collection this path walks most often.
 */
export const projectTranscript = (entries: readonly BamlTranscriptEntry[]): TranscriptResult => {
  if (entries.length > MAX_TRANSCRIPT_ENTRIES) {
    return tooLarge();
  }

  const callsById = new Map<string, BamlTranscriptToolCall>();
  const lines: string[] = [];
  let userMessage = '';
  let total = 0;

  for (const entry of entries) {
    for (const call of entry.toolCalls ?? []) {
      callsById.set(call.id, call);
    }

    const text = textOf(entry.content);

    if (entry.role === USER_ROLE) {
      userMessage = text;
    }

    let line: string;
    if (entry.role === TOOL_ROLE) {
      if (text.length > MAX_TOOL_RESULT_CHARS) {
        return tooLarge();
      }
      const call = entry.toolCallId == null ? undefined : callsById.get(entry.toolCallId);
      const name = call?.name ?? 'unknown';
      const args = JSON.stringify(call?.args ?? {});
      line = `<tool_result name="${name}" args=${args}>${text}</tool_result>`;
    } else {
      line = `${entry.role}: ${text}`;
    }

    const separatorChars = lines.length === 0 ? 0 : 1;
    const nextTotal = total + separatorChars + line.length;
    if (nextTotal > MAX_TRANSCRIPT_TEXT_CHARS) {
      return tooLarge();
    }
    total = nextTotal;
    lines.push(line);
  }

  return { ok: true, value: { userMessage, transcript: lines.join('\n') } };
};
