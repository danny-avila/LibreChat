import { ContentTypes, ErrorTypes } from 'librechat-data-provider';
import {
  COMPACTION_SEMANTIC_INDEX_PROJECTION_VERSION,
  MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES,
  MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH,
  MAX_COMPACTION_SEMANTIC_INDEX_SOURCE_CONTENT_INDEX,
  MAX_COMPACTION_SEMANTIC_INDEX_TEXT_LENGTH,
  isCompactionSemanticIndexProjection,
} from '@librechat/data-schemas';
import type {
  CompactionSemanticIndex,
  CompactionSemanticIndexEntry,
  CompactionSemanticIndexSnapshot,
} from '@librechat/agents';
import type {
  ICompactionSemanticIndexProjection,
  TCompactionSemanticIndexEntry,
} from '@librechat/data-schemas';
import type { SummaryContentPart, TMessageContentParts } from 'librechat-data-provider';

/** Text of a summary content part; empty for anything else. */
export function getSummaryPartText(part: TMessageContentParts | null | undefined): string {
  if (part?.type !== ContentTypes.SUMMARY || !Array.isArray(part.content)) {
    return '';
  }
  return part.content
    .map((block) => (typeof block?.text === 'string' ? block.text : ''))
    .join('')
    .trim();
}

/** The typed failure a manual compaction reports when it produced no summary. */
const COMPACTION_FAILED_ERROR = JSON.stringify({ type: ErrorTypes.COMPACTION_FAILED });

/**
 * The content a failed manual compaction persists: the typed failure, marked as
 * the compaction's own outcome. A turn saved from a thrown failure has no
 * content of its own, so without this the row is indistinguishable from an
 * answer to the message it hangs off and keeps that message's rerun controls.
 */
function compactionFailureContent(
  errorText: string = COMPACTION_FAILED_ERROR,
): TMessageContentParts[] {
  return [{ type: ContentTypes.ERROR, error: errorText, initiatedBy: 'user' }];
}

/**
 * The content fields a failed turn is persisted with. A manual compaction owns
 * its identity through content, so its row carries the marked failure; every
 * other failed turn contributes nothing and keeps its text-only shape. Callers
 * spread the result rather than deciding which turns are compactions.
 */
export function resolveFailedTurnContent(
  requestBody: { compact?: boolean } | null | undefined,
  errorText: string,
): { content?: TMessageContentParts[] } {
  if (requestBody?.compact !== true) {
    return {};
  }
  return { content: compactionFailureContent(errorText) };
}

/**
 * Stamps `initiatedBy: 'user'` on the part that carries a manual compaction's
 * outcome, which is the turn's only record of having been one: the run emits no
 * text of its own, and a compaction hangs off whatever leaf the branch ends
 * with, so a reader cannot infer it from the turn's shape or its parent.
 *
 * Every outcome is marked. A run that produced a summary marks it; a run that
 * recorded why it could not (an error part, e.g. a skipped compaction) marks
 * that instead; a run that produced neither records the typed failure here, so
 * it persists and streams like any other failed compaction rather than as an
 * empty assistant message. A cancelled run keeps failing as a typed error: the
 * turn stopped early rather than failing, and the abort path owns it.
 */
export function markCompactionOutcome(
  contentParts: TMessageContentParts[],
  { aborted = false }: { aborted?: boolean } = {},
): void {
  const summary = contentParts.find(
    (part): part is SummaryContentPart =>
      part?.type === ContentTypes.SUMMARY &&
      part.failed !== true &&
      getSummaryPartText(part).length > 0,
  );
  if (summary != null) {
    summary.initiatedBy = 'user';
    return;
  }
  let markedFailure = false;
  for (const part of contentParts) {
    if (part?.type === ContentTypes.ERROR) {
      part.initiatedBy = 'user';
      markedFailure = true;
    }
  }
  if (markedFailure) {
    return;
  }
  if (aborted) {
    throw Object.assign(new Error(COMPACTION_FAILED_ERROR), { code: 'COMPACTION_FAILED' });
  }
  /** A failed round keeps whatever deltas it streamed, and a summary part with
   *  text is the history boundary for everything downstream. Persisting a
   *  truncated one would stand in for the history it failed to summarize, so
   *  the unusable summary goes and the typed failure is the turn's whole
   *  outcome. */
  for (let index = contentParts.length - 1; index >= 0; index -= 1) {
    if (contentParts[index]?.type === ContentTypes.SUMMARY) {
      contentParts.splice(index, 1);
    }
  }
  contentParts.push(...compactionFailureContent());
}

type PayloadContentPart = { type?: unknown; failed?: unknown } | null | undefined;

/**
 * Removes failed summary parts from a message payload before any
 * `formatAgentMessages` call. The SDK's summary scan takes the last summary
 * part that carries text as the conversation's history boundary and drops
 * every message before it, without reading `failed`. A summarize round that
 * errored mid-stream keeps the deltas it streamed, so leaving that part in the
 * payload replaces the history it never finished summarizing with the prefix
 * it managed to produce. Message positions are preserved — only parts are
 * dropped — so an index-keyed token map stays aligned. Non-mutating; returns
 * the same reference when nothing needed stripping.
 */
export function stripFailedSummaryParts<T extends { content?: unknown }>(payload: T[]): T[] {
  if (!Array.isArray(payload)) {
    return payload;
  }
  let changed = false;
  const result = payload.map((message) => {
    const content = message?.content;
    if (!Array.isArray(content)) {
      return message;
    }
    const filtered = content.filter((part) => {
      const candidate = part as PayloadContentPart;
      return !(candidate?.type === ContentTypes.SUMMARY && candidate.failed === true);
    });
    if (filtered.length === content.length) {
      return message;
    }
    changed = true;
    return { ...message, content: filtered };
  });
  return changed ? result : payload;
}

function snapshotEntry(
  entry: CompactionSemanticIndexEntry,
): TCompactionSemanticIndexEntry | undefined {
  const { type, sourceMessageId, sourceContentIndex, revision, status, text, redacted } = entry;
  if (
    typeof sourceMessageId !== 'string' ||
    sourceMessageId.length === 0 ||
    sourceMessageId.length > MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH ||
    !Number.isSafeInteger(sourceContentIndex) ||
    sourceContentIndex < 0 ||
    sourceContentIndex > MAX_COMPACTION_SEMANTIC_INDEX_SOURCE_CONTENT_INDEX ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    (status !== 'committed' && status !== 'pending') ||
    typeof text !== 'string' ||
    (redacted !== undefined && typeof redacted !== 'boolean')
  ) {
    return undefined;
  }
  const oversized = text.length > MAX_COMPACTION_SEMANTIC_INDEX_TEXT_LENGTH;
  const snapshotRedacted = redacted === true || oversized;
  const snapshotText = status === 'pending' || snapshotRedacted ? '' : text;
  const common = {
    sourceMessageId,
    sourceContentIndex,
    revision,
    status,
    text: snapshotText,
    ...(redacted !== undefined || oversized ? { redacted: snapshotRedacted } : {}),
  };
  if (type === 'activity_phase') {
    return { type, ...common };
  }
  if (type === 'reasoning_label') {
    const reasoningStepId = entry.reasoningStepId;
    if (
      typeof reasoningStepId !== 'string' ||
      reasoningStepId.length === 0 ||
      reasoningStepId.length > MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH
    ) {
      return undefined;
    }
    return { type, reasoningStepId, ...common };
  }
  const toolCallId = entry.toolCallId;
  if (
    typeof toolCallId !== 'string' ||
    toolCallId.length === 0 ||
    toolCallId.length > MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH
  ) {
    return undefined;
  }
  return { type, toolCallId, ...common };
}

function isCompactionSemanticIndexSnapshot(
  input: CompactionSemanticIndex | CompactionSemanticIndexSnapshot,
): input is CompactionSemanticIndexSnapshot {
  return !Array.isArray(input);
}

export function createCompactionSemanticIndexProjection(
  input: CompactionSemanticIndex | CompactionSemanticIndexSnapshot | undefined,
): ICompactionSemanticIndexProjection | undefined {
  if (input == null) {
    return undefined;
  }
  const isSnapshot = isCompactionSemanticIndexSnapshot(input);
  const index = isSnapshot ? input.entries : input;
  const providedEntryCount = isSnapshot ? input.providedEntryCount : input.length;
  if (
    !Array.isArray(index) ||
    index.length === 0 ||
    index.length > MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES ||
    providedEntryCount == null ||
    !Number.isSafeInteger(providedEntryCount) ||
    providedEntryCount < index.length
  ) {
    return undefined;
  }
  const entries: TCompactionSemanticIndexEntry[] = [];
  for (const entry of index) {
    const snapshot = snapshotEntry(entry);
    if (snapshot == null) {
      return undefined;
    }
    entries.push(snapshot);
  }
  return {
    version: COMPACTION_SEMANTIC_INDEX_PROJECTION_VERSION,
    entries,
    providedEntryCount,
  };
}

export function restoreCompactionSemanticIndexSnapshot(
  projection: ICompactionSemanticIndexProjection | null | undefined,
): CompactionSemanticIndexSnapshot | undefined {
  if (!isCompactionSemanticIndexProjection(projection)) {
    return undefined;
  }
  const entries: CompactionSemanticIndexEntry[] = [];
  for (const entry of projection.entries) {
    const snapshot = snapshotEntry(entry);
    if (snapshot == null) {
      return undefined;
    }
    entries.push(Object.freeze(snapshot));
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    providedEntryCount: projection.providedEntryCount ?? entries.length,
  });
}

export function restoreCompactionSemanticIndex(
  projection: ICompactionSemanticIndexProjection | null | undefined,
): CompactionSemanticIndex | undefined {
  return restoreCompactionSemanticIndexSnapshot(projection)?.entries;
}
