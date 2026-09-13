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

/**
 * Stamps `initiatedBy: 'user'` on the part that carries a manual compaction's
 * outcome, which is the turn's only record of having been one: the run emits no
 * text of its own, and a compaction hangs off whatever leaf the branch ends
 * with, so a reader cannot infer it from the turn's shape or its parent.
 *
 * Both outcomes are marked. A run that produced a summary marks it; a run that
 * recorded why it could not (an error part, e.g. a skipped compaction) marks
 * that instead, so the failure is still identifiable as a compaction rather
 * than as an answer to the message behind it. A run that ended with neither
 * fails as a typed error instead of persisting an empty assistant message.
 */
export function markCompactionOutcome(contentParts: TMessageContentParts[]): void {
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
  throw Object.assign(new Error(JSON.stringify({ type: ErrorTypes.COMPACTION_FAILED })), {
    code: 'COMPACTION_FAILED',
  });
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
