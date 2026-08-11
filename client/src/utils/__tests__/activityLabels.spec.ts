import { ContentTypes } from 'librechat-data-provider';
import type { TActivityLabelEvent, TMessage, TMessageContentParts } from 'librechat-data-provider';
import {
  applyActivityLabelPart,
  groupActivityPhases,
  lastVisibleContentIdx,
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
