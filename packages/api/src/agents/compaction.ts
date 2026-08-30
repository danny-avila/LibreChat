import {
  COMPACTION_SEMANTIC_INDEX_PROJECTION_VERSION,
  MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES,
  MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH,
  MAX_COMPACTION_SEMANTIC_INDEX_SOURCE_CONTENT_INDEX,
  MAX_COMPACTION_SEMANTIC_INDEX_TEXT_LENGTH,
  isCompactionSemanticIndexProjection,
} from '@librechat/data-schemas';
import type {
  ICompactionSemanticIndexProjection,
  TCompactionSemanticIndexEntry,
} from '@librechat/data-schemas';
import type { CompactionSemanticIndex, CompactionSemanticIndexEntry } from '@librechat/agents';

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

export function createCompactionSemanticIndexProjection(
  index: CompactionSemanticIndex | undefined,
): ICompactionSemanticIndexProjection | undefined {
  if (
    index == null ||
    !Array.isArray(index) ||
    index.length === 0 ||
    index.length > MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES
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
  };
}

export function restoreCompactionSemanticIndex(
  projection: ICompactionSemanticIndexProjection | null | undefined,
): CompactionSemanticIndex | undefined {
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
  return Object.freeze(entries);
}
