import { ContentTypes, ErrorTypes } from 'librechat-data-provider';
import { COMPACTION_SEMANTIC_INDEX_LIMITS } from '@librechat/agents';
import {
  MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES,
  MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH,
  MAX_COMPACTION_SEMANTIC_INDEX_SOURCE_CONTENT_INDEX,
  MAX_COMPACTION_SEMANTIC_INDEX_TEXT_LENGTH,
} from '@librechat/data-schemas';
import type { CompactionSemanticIndex, CompactionSemanticIndexSnapshot } from '@librechat/agents';
import type { SummaryContentPart, TMessageContentParts } from 'librechat-data-provider';
import type { ICompactionSemanticIndexProjection } from '@librechat/data-schemas';
import {
  createCompactionSemanticIndexProjection,
  markCompactionOutcome,
  resolveFailedTurnContent,
  restoreCompactionSemanticIndex,
  restoreCompactionSemanticIndexSnapshot,
} from './compaction';

const index = [
  {
    type: 'activity_phase',
    sourceMessageId: 'message-1',
    sourceContentIndex: 2,
    revision: 1,
    status: 'committed',
    text: 'Verified the release',
  },
  {
    type: 'reasoning_label',
    sourceMessageId: 'message-1',
    sourceContentIndex: 3,
    revision: 2,
    status: 'pending',
    text: 'This pending text must not persist',
    reasoningStepId: 'reasoning-1',
  },
] satisfies CompactionSemanticIndex;

describe('compaction semantic index continuation projection', () => {
  it('keeps persistence bounds aligned with the SDK admission limits', () => {
    expect(MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES).toBe(
      COMPACTION_SEMANTIC_INDEX_LIMITS.maxInputEntries,
    );
    expect(MAX_COMPACTION_SEMANTIC_INDEX_TEXT_LENGTH).toBe(
      COMPACTION_SEMANTIC_INDEX_LIMITS.maxInputTextChars,
    );
    expect(MAX_COMPACTION_SEMANTIC_INDEX_IDENTITY_LENGTH).toBe(
      COMPACTION_SEMANTIC_INDEX_LIMITS.maxIdentityChars,
    );
    expect(MAX_COMPACTION_SEMANTIC_INDEX_SOURCE_CONTENT_INDEX).toBe(
      COMPACTION_SEMANTIC_INDEX_LIMITS.maxSourceContentIndex,
    );
  });

  it('snapshots exact JSON-safe guidance and blanks pending text', () => {
    const projection = createCompactionSemanticIndexProjection(index);

    expect(projection).toEqual({
      version: 1,
      providedEntryCount: 2,
      entries: [
        index[0],
        {
          ...index[1],
          text: '',
        },
      ],
    });
    expect(restoreCompactionSemanticIndex(projection)).toEqual(projection?.entries);
  });

  it('preserves cumulative omission counts across JSON persistence', () => {
    const snapshot = {
      entries: index,
      providedEntryCount: 17,
    } satisfies CompactionSemanticIndexSnapshot;
    const projection = createCompactionSemanticIndexProjection(snapshot);

    expect(projection).toEqual({
      version: 1,
      entries: [index[0], { ...index[1], text: '' }],
      providedEntryCount: 17,
    });
    expect(restoreCompactionSemanticIndexSnapshot(JSON.parse(JSON.stringify(projection)))).toEqual({
      entries: projection?.entries,
      providedEntryCount: 17,
    });
  });

  it('defaults legacy projections to their retained entry count', () => {
    const legacyProjection = {
      version: 1,
      entries: [index[0]],
    } satisfies ICompactionSemanticIndexProjection;

    expect(restoreCompactionSemanticIndexSnapshot(legacyProjection)).toEqual({
      entries: legacyProjection.entries,
      providedEntryCount: 1,
    });
  });

  it('fails closed for malformed or oversized continuation state', () => {
    const malformed = {
      version: 1,
      entries: [{ ...index[0], sourceContentIndex: -1 }],
    } as ICompactionSemanticIndexProjection;
    const oversized = {
      version: 1,
      entries: Array.from({ length: MAX_COMPACTION_SEMANTIC_INDEX_ENTRIES + 1 }, () => index[0]),
    } as ICompactionSemanticIndexProjection;
    const corrupt = {
      version: 1,
      entries: [null],
    } as never;
    const impossibleCount = {
      version: 1,
      entries: index,
      providedEntryCount: 1,
    } as ICompactionSemanticIndexProjection;

    expect(restoreCompactionSemanticIndex(malformed)).toBeUndefined();
    expect(restoreCompactionSemanticIndex(oversized)).toBeUndefined();
    expect(restoreCompactionSemanticIndex(corrupt)).toBeUndefined();
    expect(restoreCompactionSemanticIndexSnapshot(impossibleCount)).toBeUndefined();
    expect(createCompactionSemanticIndexProjection(oversized.entries)).toBeUndefined();
  });

  it('redacts oversized text before persistence', () => {
    const projection = createCompactionSemanticIndexProjection([
      {
        ...index[0],
        text: 'x'.repeat(MAX_COMPACTION_SEMANTIC_INDEX_TEXT_LENGTH + 1),
      },
    ]);

    expect(projection?.entries[0]).toEqual({
      ...index[0],
      text: '',
      redacted: true,
    });
  });
});

describe('markCompactionOutcome', () => {
  const summary = (
    text: string,
    overrides: Partial<SummaryContentPart> = {},
  ): TMessageContentParts => ({
    type: ContentTypes.SUMMARY,
    content: [{ type: ContentTypes.TEXT, text }],
    ...overrides,
  });
  const failure = (error: string): TMessageContentParts => ({ type: ContentTypes.ERROR, error });

  it('marks the summary a compaction produced', () => {
    const parts = [summary('Earlier turns, compacted.')];

    markCompactionOutcome(parts);

    expect(parts[0]).toMatchObject({ initiatedBy: 'user' });
  });

  /** The turn has no other record of having been a compaction: without the
   *  marker a failure hanging off a user message keeps a Regenerate that
   *  answers that message instead of redoing the compaction. */
  it('marks the failure a compaction recorded instead of a summary', () => {
    const parts = [failure('Nothing to summarize')];

    markCompactionOutcome(parts);

    expect(parts[0]).toMatchObject({ initiatedBy: 'user' });
  });

  it('marks the failure when only a partial summary streamed before it', () => {
    const parts = [summary('Half a checkpoint', { failed: true }), failure('Summarization failed')];

    markCompactionOutcome(parts);

    expect(parts[0]).not.toHaveProperty('initiatedBy');
    expect(parts[1]).toMatchObject({ initiatedBy: 'user' });
  });

  /** The fallback the reviewed head threw on: a run that produced neither a
   *  summary nor an explanation now records the typed failure itself, so the
   *  turn carries the marker on the stream and in storage instead of being
   *  saved as a bare error row with no content. */
  it.each([
    ['nothing at all', []],
    ['an empty summary', [summary('   ')]],
    [
      'a partial summary with no recorded failure',
      [summary('Half a checkpoint', { failed: true })],
    ],
  ])('records a marked typed failure for a run that produced %s', (_label, parts) => {
    markCompactionOutcome(parts);

    /** The typed failure is the turn's whole outcome: a truncated summary left
     *  beside it would report the same failure a second time. */
    expect(parts).toEqual([
      {
        type: ContentTypes.ERROR,
        error: JSON.stringify({ type: ErrorTypes.COMPACTION_FAILED }),
        initiatedBy: 'user',
      },
    ]);
  });

  /** A cancelled compaction stopped early rather than failing, and the abort
   *  path owns that turn: it must not be turned into a failure row. */
  it('fails as a typed error when the run was cancelled', () => {
    const parts: TMessageContentParts[] = [];

    expect(() => markCompactionOutcome(parts, { aborted: true })).toThrow(
      JSON.stringify({ type: ErrorTypes.COMPACTION_FAILED }),
    );
    expect(parts).toHaveLength(0);
  });
});

describe('resolveFailedTurnContent', () => {
  /** A thrown failure leaves the turn with no content of its own, so the row a
   *  compaction persists carries the marked failure instead. */
  it('gives a failed compaction turn its marked failure content', () => {
    expect(resolveFailedTurnContent({ compact: true }, 'Summarization failed')).toEqual({
      content: [{ type: ContentTypes.ERROR, error: 'Summarization failed', initiatedBy: 'user' }],
    });
  });

  it.each([
    ['an ordinary turn', { compact: false }],
    ['a turn that never asked to compact', {}],
    ['a request with no body', undefined],
  ])('leaves %s with its text-only shape', (_label, requestBody) => {
    expect(resolveFailedTurnContent(requestBody, 'Something failed')).toEqual({});
  });
});
