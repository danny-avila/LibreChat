import { ContentTypes } from 'librechat-data-provider';
import type { TActivityLabelEvent, TMessage } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import { applyActivityLabelPart, buildActivityCountsPhrase } from '../activityLabels';

const localize: LocalizeFunction = ((key: string, options?: Record<string, string>) =>
  `${key}:${options?.[0] ?? ''}`) as LocalizeFunction;

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

describe('buildActivityCountsPhrase', () => {
  it('localizes singular and plural segments', () => {
    const phrase = buildActivityCountsPhrase(
      { searches: 2, reads: 1, writes: 0, commands: 0, other: 0 },
      localize,
    );
    expect(phrase).toBe('com_ui_activity_searched_other:2 · com_ui_activity_read_one:1');
  });
});
