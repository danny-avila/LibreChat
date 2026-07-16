import { ContentTypes } from 'librechat-data-provider';

import type { TMessageContentParts } from 'librechat-data-provider';

import { truncateSpokenContent } from '../truncate';

const textPart = (text: string): TMessageContentParts =>
  ({ type: ContentTypes.TEXT, text }) as TMessageContentParts;

const toolPart = (): TMessageContentParts =>
  ({ type: ContentTypes.TOOL_CALL, tool_call: { name: 'search' } }) as TMessageContentParts;

const textOf = (part: TMessageContentParts): unknown => (part as { text?: unknown }).text;

describe('truncateSpokenContent', () => {
  it('keeps only what was heard', () => {
    const result = truncateSpokenContent([textPart('Hello there friend')], 5);

    expect(textOf(result[0])).toBe('Hello');
  });

  it('leaves content untouched when everything was heard', () => {
    const content = [textPart('Hello')];

    expect(truncateSpokenContent(content, 5)).toEqual(content);
    expect(truncateSpokenContent(content, 99)).toEqual(content);
  });

  it('empties the text when nothing was heard', () => {
    const result = truncateSpokenContent([textPart('Never spoken')], 0);

    expect(textOf(result[0])).toBe('');
  });

  it('truncates across multiple text parts in order', () => {
    const result = truncateSpokenContent([textPart('abc'), textPart('defgh')], 5);

    expect(textOf(result[0])).toBe('abc');
    expect(textOf(result[1])).toBe('de');
  });

  it('preserves non-text parts, which were never spoken', () => {
    const result = truncateSpokenContent([textPart('abc'), toolPart(), textPart('def')], 1);

    expect(textOf(result[0])).toBe('a');
    expect(result[1]).toEqual(toolPart());
    expect(textOf(result[2])).toBe('');
  });

  it('handles the { value } text shape', () => {
    const part = {
      type: ContentTypes.TEXT,
      text: { value: 'Hello there' },
    } as TMessageContentParts;

    const result = truncateSpokenContent([part], 5);

    expect(textOf(result[0])).toEqual({ value: 'Hello' });
  });

  it('does not mutate the input', () => {
    const content = [textPart('Hello there')];
    truncateSpokenContent(content, 2);

    expect(textOf(content[0])).toBe('Hello there');
  });

  it('is identity for a negative count rather than throwing', () => {
    const content = [textPart('Hello')];

    expect(truncateSpokenContent(content, -1)).toEqual(content);
  });
});
