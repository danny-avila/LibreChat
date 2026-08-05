import { ContentTypes } from 'librechat-data-provider';
import type { TActivityLabelEvent, TMessage, TMessageContentParts } from 'librechat-data-provider';
import { applyActivityLabelPart, lastVisibleContentIdx } from '../activityLabels';

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
});
