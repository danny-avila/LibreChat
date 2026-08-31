import { ContentTypes } from 'librechat-data-provider';
import type { TActivityLabelEvent, TMessage, TMessageContentParts } from 'librechat-data-provider';
import {
  applyActivityLabelPart,
  groupActivityPhases,
  lastCursorContentIdx,
  lastVisibleContentIdx,
  offsetActivityPhaseBoundary,
} from '../activityLabels';

const buildMessage = (content: TMessage['content']): TMessage =>
  ({ messageId: 'm1', isCreatedByUser: false, content }) as TMessage;

const labelPart = (
  overrides: Partial<TActivityLabelEvent['part']> = {},
): TActivityLabelEvent['part'] => ({
  type: ContentTypes.ACTIVITY_LABEL,
  [ContentTypes.ACTIVITY_LABEL]: '',
  pending: true,
  ...overrides,
});

describe('applyActivityLabelPart', () => {
  it('writes the part at its claimed index', () => {
    const message = buildMessage([]);
    const updated = applyActivityLabelPart(message, { index: 2, part: labelPart() });
    expect(updated).not.toBe(message);
    expect((updated.content as unknown[])[2]).toMatchObject({
      type: ContentTypes.ACTIVITY_LABEL,
      pending: true,
    });
  });

  it('returns the same reference on duplicate replay', () => {
    const part = labelPart({ activity_label: 'Searched docs', pending: false });
    const message = buildMessage([undefined as never, part as never]);
    const updated = applyActivityLabelPart(message, { index: 1, part });
    expect(updated).toBe(message);
  });

  it('applies a bounds-only update to a completed phase', () => {
    const existing = labelPart({ activity_label: 'Fixed the session', pending: false });
    Object.assign(existing, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_count: 2,
    });
    const incoming = { ...existing, activity_start_index: 1 };
    const message = buildMessage([existing as never]);

    const updated = applyActivityLabelPart(message, { index: 0, part: incoming });

    expect(updated).not.toBe(message);
    expect((updated.content as unknown[])[0]).toMatchObject({
      activity_start_index: 1,
      activity_count: 2,
    });
  });

  it('never lets a stale pending placeholder overwrite a resolved label', () => {
    const resolved = labelPart({
      activity_label: 'Searched runtime release notes',
      pending: false,
    });
    const message = buildMessage([resolved as never]);
    const updated = applyActivityLabelPart(message, {
      index: 0,
      part: labelPart({ pending: true }),
    });
    expect(updated).toBe(message);
    expect((updated.content as unknown[])[0]).toMatchObject({
      activity_label: 'Searched runtime release notes',
      pending: false,
    });
  });

  it('never lets a stale pending placeholder overwrite an empty finalized phase', () => {
    const finalized = labelPart({ pending: false });
    Object.assign(finalized, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
    const message = buildMessage([finalized as never]);

    const updated = applyActivityLabelPart(message, {
      index: 0,
      part: labelPart({ pending: true }),
    });

    expect(updated).toBe(message);
    expect((updated.content as unknown[])[0]).toMatchObject({
      activity_label: '',
      activity_label_type: 'phase',
      pending: false,
    });
  });
});

describe('lastVisibleContentIdx', () => {
  const text = { type: ContentTypes.TEXT, text: 'hello' } as unknown as TMessageContentParts;
  const tool = {
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: { id: 't1', name: 'web_search', args: '{}', output: 'ok' },
  } as unknown as TMessageContentParts;

  it('skips a trailing blank label reservation', () => {
    expect(lastVisibleContentIdx([text, tool, labelPart() as never])).toBe(1);
  });

  it('skips consecutive trailing blank labels', () => {
    expect(lastVisibleContentIdx([tool, labelPart() as never, tool, labelPart() as never])).toBe(2);
  });

  it('counts a filled label as visible', () => {
    const filled = labelPart({ activity_label: 'Fetched the docs', pending: false });
    expect(lastVisibleContentIdx([tool, filled as never])).toBe(1);
  });

  it('falls back to the raw last index without labels', () => {
    expect(lastVisibleContentIdx([text, tool])).toBe(1);
    expect(lastVisibleContentIdx([])).toBe(-1);
    expect(lastVisibleContentIdx(undefined)).toBe(-1);
  });

  it('skips large sparse trailing gaps', () => {
    expect(lastVisibleContentIdx([undefined, tool, undefined, undefined])).toBe(1);
    const sparse = new Array<TMessageContentParts | undefined>(10_000);
    sparse[1] = tool;
    expect(lastVisibleContentIdx(sparse)).toBe(1);
  });

  it('keeps sparse late-label adoption bounded to defined slots', () => {
    const sparse = new Array<TMessageContentParts | undefined>(10_000);
    sparse[0] = tool;
    sparse[9_998] = labelPart({
      activity_label: 'Recorded the delayed result',
      pending: false,
    }) as never;
    const phase = labelPart({ activity_label: 'Completed the investigation', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    sparse[9_999] = phase as never;

    expect(lastVisibleContentIdx(sparse)).toBe(9_999);
  });

  it('keeps an appended phase marker as the visible tail when its final slot is empty', () => {
    const phase = labelPart({ activity_label: 'Completed the investigation', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    const emptyText = { type: ContentTypes.TEXT, text: '' } as TMessageContentParts;

    expect(lastVisibleContentIdx([tool, emptyText, phase as never])).toBe(2);
  });

  it('keeps the phase marker visible when an adopted late label follows an empty final slot', () => {
    const child = labelPart({ activity_label: 'Recorded the delayed result', pending: false });
    const phase = labelPart({ activity_label: 'Completed the investigation', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    const emptyText = { type: ContentTypes.TEXT, text: '' } as TMessageContentParts;

    expect(lastVisibleContentIdx([tool, emptyText, child as never, phase as never])).toBe(3);
  });
});

describe('lastCursorContentIdx', () => {
  it('keeps the cursor on visible output before a trailing empty provider placeholder', () => {
    const text = { type: ContentTypes.TEXT, text: 'Visible answer' } as TMessageContentParts;
    const emptyText = { type: ContentTypes.TEXT, text: '' } as TMessageContentParts;

    expect(lastCursorContentIdx([text, emptyText])).toBe(0);
  });

  it('retains a solitary empty placeholder for the initial waiting state', () => {
    const emptyText = { type: ContentTypes.TEXT, text: '' } as TMessageContentParts;

    expect(lastCursorContentIdx([emptyText])).toBe(0);
  });

  it('retains a sparse empty placeholder when no visible output precedes it', () => {
    const emptyText = { type: ContentTypes.TEXT, text: '' } as TMessageContentParts;

    expect(lastCursorContentIdx([undefined, emptyText])).toBe(1);
  });
});

describe('offsetActivityPhaseBoundary', () => {
  it('folds only boundaries covered by the merged first completion part', () => {
    expect(offsetActivityPhaseBoundary(0, 5, true)).toBe(4);
    expect(offsetActivityPhaseBoundary(1, 5, true)).toBe(5);
    expect(offsetActivityPhaseBoundary(3, 5, true)).toBe(8);
    expect(offsetActivityPhaseBoundary(3, 5, false)).toBe(8);
  });
});

describe('groupActivityPhases', () => {
  const text = { type: ContentTypes.TEXT, text: 'final answer' } as TMessageContentParts;
  const tool = {
    type: ContentTypes.TOOL_CALL,
    tool_call: { id: 't1', name: 'web_search', args: '{}', output: 'ok' },
  } as unknown as TMessageContentParts;

  it('carries absolute offsets while consuming a completed parent marker', () => {
    const phase = labelPart({ activity_label: 'Compared both release paths', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 1,
      activity_count: 2,
    });
    const segments = groupActivityPhases([text, tool, tool, phase as never, text]);
    expect(segments).toHaveLength(3);
    expect(segments?.[1]).toMatchObject({ type: 'phase', labelIndex: 3, startIndex: 1 });
    if (segments?.[1]?.type === 'phase') {
      expect(segments[1].content).toEqual([tool, tool]);
    }
  });

  it('renders an appended parent marker before the final text using its explicit end', () => {
    const phase = labelPart({ activity_label: 'Completed the full investigation', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
    const final = { type: ContentTypes.TEXT, text: 'Final answer' } as TMessageContentParts;
    const segments = groupActivityPhases([tool, tool, final, phase as never]);

    expect(segments).toHaveLength(2);
    expect(segments?.[0]).toMatchObject({
      type: 'phase',
      labelIndex: 3,
      startIndex: 0,
      content: [tool, tool],
    });
    expect(segments?.[1]).toMatchObject({
      type: 'content',
      startIndex: 2,
      content: [final],
    });
    expect(lastVisibleContentIdx([tool, tool, final, phase as never])).toBe(2);
  });

  it('keeps an emptied earlier phase header when a later marker recovers nothing', () => {
    const laterTool = {
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: 'later', name: 'web_search', args: '{}', output: 'ok' },
    } as unknown as TMessageContentParts;
    /** Compaction left this completed phase with no children, so its summary
     *  header is the entire segment. A later marker recovers nothing from it. */
    const emptied = labelPart({ activity_label: 'Completed the compacted phase', pending: false });
    Object.assign(emptied, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 0,
      activity_count: 2,
    });
    const later = labelPart({ activity_label: 'Completed the later phase', pending: false });
    Object.assign(later, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
    const content = [emptied as never, laterTool, later as never];

    const segments = groupActivityPhases(content);

    expect(segments?.filter((segment) => segment.type === 'phase')).toHaveLength(2);
  });

  it('groups multiple logical spans when an earlier phase marker arrives late', () => {
    const first = labelPart({ activity_label: 'Completed the first phase', pending: false });
    Object.assign(first, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
    const second = labelPart({ activity_label: 'Completed the second phase', pending: false });
    Object.assign(second, {
      activity_label_type: 'phase',
      activity_start_index: 3,
      activity_end_index: 6,
      activity_count: 2,
    });
    const boundary = {
      type: ContentTypes.TEXT,
      text: 'Substantial result',
    } as TMessageContentParts;
    const final = { type: ContentTypes.TEXT, text: 'Final result' } as TMessageContentParts;
    const content = [tool, tool, boundary, tool, first as never, tool, final, second as never];

    const segments = groupActivityPhases(content);

    expect(segments).toEqual([
      expect.objectContaining({
        type: 'phase',
        startIndex: 0,
        labelIndex: 4,
        contentIndices: [0, 1],
      }),
      expect.objectContaining({
        type: 'content',
        startIndex: 2,
        contentIndices: [2],
      }),
      expect.objectContaining({
        type: 'phase',
        startIndex: 3,
        labelIndex: 7,
        contentIndices: [3, 5],
      }),
      expect.objectContaining({
        type: 'content',
        startIndex: 6,
        contentIndices: [6],
      }),
    ]);
  });

  it('moves a late child label from an earlier phase into its declared later span', () => {
    const firstTool = {
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: 'first', name: 'web_search', args: '{}', output: 'ok' },
    } as unknown as TMessageContentParts;
    const laterTool = {
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: 'later', name: 'web_search', args: '{}', output: 'ok' },
    } as unknown as TMessageContentParts;
    const lateChild = labelPart({
      activity_label: 'Recorded the later result',
      pending: false,
      tool_call_ids: ['later'],
    });
    const first = labelPart({ activity_label: 'Completed the first phase', pending: false });
    Object.assign(first, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    const second = labelPart({ activity_label: 'Completed the second phase', pending: false });
    Object.assign(second, {
      activity_label_type: 'phase',
      activity_start_index: 2,
      activity_end_index: 4,
      activity_count: 2,
    });
    const boundary = { type: ContentTypes.TEXT, text: 'Boundary' } as TMessageContentParts;
    const content = [
      firstTool,
      boundary,
      laterTool,
      lateChild as never,
      first as never,
      second as never,
    ];

    const segments = groupActivityPhases(content);

    expect(segments).toEqual([
      expect.objectContaining({
        type: 'phase',
        labelIndex: 4,
        contentIndices: [0],
      }),
      expect.objectContaining({
        type: 'content',
        contentIndices: [1],
      }),
      expect.objectContaining({
        type: 'phase',
        labelIndex: 5,
        contentIndices: [2, 3],
      }),
    ]);
  });

  it('keeps a late child label in the phase while leaving final text outside', () => {
    const child = labelPart({
      activity_label: 'Recorded the delayed child result',
      pending: false,
      tool_call_ids: ['t1'],
    });
    const phase = labelPart({ activity_label: 'Completed the investigation', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    const final = { type: ContentTypes.TEXT, text: 'Final answer' } as TMessageContentParts;
    const content = [tool, final, child as never, phase as never];

    const segments = groupActivityPhases(content);

    expect(segments).toHaveLength(2);
    expect(segments?.[0]).toMatchObject({
      type: 'phase',
      startIndex: 0,
      content: [tool, child],
      contentIndices: [0, 2],
    });
    expect(segments?.[1]).toMatchObject({
      type: 'content',
      startIndex: 1,
      content: [final],
      contentIndices: [1],
    });
    expect(lastVisibleContentIdx(content)).toBe(1);
  });

  it('groups a sparse late child label without walking the empty range', () => {
    const content = new Array<TMessageContentParts | undefined>(10_000);
    const child = labelPart({ activity_label: 'Recorded the delayed result', pending: false });
    const phase = labelPart({
      activity_label: 'Completed the sparse investigation',
      pending: false,
    });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    content[0] = tool;
    content[9_998] = child as never;
    content[9_999] = phase as never;

    const segments = groupActivityPhases(content);

    expect(segments?.[0]).toMatchObject({
      type: 'phase',
      startIndex: 0,
      labelIndex: 9_999,
    });
    if (segments?.[0]?.type === 'phase') {
      expect(segments[0].content[0]).toBe(tool);
      expect(segments[0].content[1]).toBe(child);
      expect(segments[0].contentIndices).toEqual([0, 9_998]);
      expect(segments[0].content).toHaveLength(2);
    }
  });

  it('restores a late child label when the parent label resolves empty', () => {
    const child = labelPart({
      activity_label: 'Recorded the delayed child result',
      pending: false,
      tool_call_ids: ['t1'],
    });
    const phase = labelPart({ pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 1,
      activity_count: 2,
    });
    const final = { type: ContentTypes.TEXT, text: 'Final answer' } as TMessageContentParts;
    const content = [tool, final, child as never, phase as never];

    const segments = groupActivityPhases(content);

    expect(segments).toEqual([
      expect.objectContaining({
        type: 'content',
        startIndex: 0,
        content: [tool, child],
        contentIndices: [0, 2],
      }),
      expect.objectContaining({
        type: 'content',
        startIndex: 1,
        content: [final],
        contentIndices: [1],
      }),
    ]);
    expect(lastVisibleContentIdx(content)).toBe(1);
  });

  it('leaves pending or empty parent markers on the feature-off path', () => {
    const pending = labelPart();
    Object.assign(pending, { activity_label_type: 'phase', activity_start_index: 0 });
    expect(groupActivityPhases([tool, pending as never])).toBeUndefined();
  });

  it('preserves a completed summary when every phase child was filtered out', () => {
    const phase = labelPart({ activity_label: 'Reconciled both release paths', pending: false });
    Object.assign(phase, {
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_count: 2,
    });

    expect(groupActivityPhases([labelPart() as never, phase as never])).toEqual([
      expect.objectContaining({
        type: 'phase',
        labelIndex: 1,
        hasContent: false,
      }),
    ]);
  });
});
