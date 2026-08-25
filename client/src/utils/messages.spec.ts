import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { preserveStreamedContentIdentity } from './messages';

const text = (value: string, extra: Record<string, unknown> = {}): TMessageContentParts =>
  ({ type: ContentTypes.TEXT, text: value, ...extra }) as TMessageContentParts;

const think = (value: string): TMessageContentParts =>
  ({ type: ContentTypes.THINK, think: value }) as TMessageContentParts;

const tool = (id: string | undefined, name = 'search'): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    tool_call: { id, name, args: '' },
  }) as TMessageContentParts;

const label = (value: string, extra: Record<string, unknown> = {}): TMessageContentParts =>
  ({ type: ContentTypes.ACTIVITY_LABEL, activity_label: value, ...extra }) as TMessageContentParts;

const streamedIndexes = (content: TMessage['content']): Array<number | undefined> =>
  (content ?? []).map((part) => part?.streamedIndex);

describe('preserveStreamedContentIdentity', () => {
  it('stamps every part shifted by compacted holes with its streamed index', () => {
    const streamed = [
      undefined,
      tool('call_a'),
      label('first'),
      undefined,
      tool('call_b'),
      label('second'),
      text('answer'),
      label('phase', { activity_label_type: 'phase' }),
    ];
    const final = [
      tool('call_a'),
      label('first'),
      tool('call_b'),
      label('second'),
      text('answer'),
      label('phase', { activity_label_type: 'phase' }),
    ];

    const result = preserveStreamedContentIdentity(streamed, final);

    expect(streamedIndexes(result)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(final.every((part) => part.streamedIndex === undefined)).toBe(true);
  });

  it('returns the final array untouched when no hole shifted anything', () => {
    const streamed = [tool('call_a'), text('answer')];
    const final = [tool('call_a'), text('answer')];

    expect(preserveStreamedContentIdentity(streamed, final)).toBe(final);
  });

  it('leaves aligned prefix parts unstamped while stamping the shifted tail', () => {
    const streamed = [text('intro'), undefined, tool('call_a')];
    const final = [text('intro'), tool('call_a')];

    expect(streamedIndexes(preserveStreamedContentIdentity(streamed, final))).toEqual([
      undefined,
      2,
    ]);
  });

  it('skips streamed empty-text placeholders the compaction dropped', () => {
    const streamed = [text(''), tool('call_a'), text('answer')];
    const final = [tool('call_a'), text('answer')];

    expect(streamedIndexes(preserveStreamedContentIdentity(streamed, final))).toEqual([1, 2]);
  });

  it('skips streamed empty think parts and typeless placeholders', () => {
    const streamed = [
      { type: '' } as unknown as TMessageContentParts,
      think(''),
      think('reasoned'),
      text('answer'),
    ];
    const final = [think('reasoned'), text('answer')];

    expect(streamedIndexes(preserveStreamedContentIdentity(streamed, final))).toEqual([2, 3]);
  });

  it('matches by identity, not equality: richer final text keeps its streamed slot', () => {
    const streamed = [undefined, text('partial ans')];
    const final = [text('partial answer, completed.')];

    expect(streamedIndexes(preserveStreamedContentIdentity(streamed, final))).toEqual([1]);
  });

  it('pairs tool calls by id and abandons stamping on an id mismatch', () => {
    const streamed = [undefined, tool('call_a')];
    const final = [tool('call_other')];

    expect(preserveStreamedContentIdentity(streamed, final)).toBe(final);
  });

  it('abandons stamping when the server appended a part that never streamed', () => {
    const streamed = [undefined, tool('call_a')];
    const final = [tool('call_a'), text('server-added')];

    expect(preserveStreamedContentIdentity(streamed, final)).toBe(final);
  });

  it('abandons stamping on a type mismatch instead of mispairing', () => {
    const streamed = [think('reasoned'), text('answer')];
    const final = [text('answer')];

    expect(preserveStreamedContentIdentity(streamed, final)).toBe(final);
  });

  it('returns final content untouched when nothing streamed', () => {
    const final = [text('answer')];

    expect(preserveStreamedContentIdentity(undefined, final)).toBe(final);
    expect(preserveStreamedContentIdentity([], final)).toBe(final);
  });

  it('carries existing stamps forward when a settled message is re-delivered compact', () => {
    const streamedSparse = [undefined, tool('call_a'), label('first'), undefined, text('answer')];
    const settled = preserveStreamedContentIdentity(streamedSparse, [
      tool('call_a'),
      label('first'),
      text('answer'),
    ]);
    expect(streamedIndexes(settled)).toEqual([1, 2, 4]);

    const redelivered = [tool('call_a'), label('first'), text('answer')];
    const result = preserveStreamedContentIdentity(settled, redelivered);

    expect(streamedIndexes(result)).toEqual([1, 2, 4]);
  });

  it('carries a partially stamped message forward without stamping its aligned prefix', () => {
    const streamedSparse = [text('intro'), undefined, tool('call_a')];
    const settled = preserveStreamedContentIdentity(streamedSparse, [
      text('intro'),
      tool('call_a'),
    ]);
    expect(streamedIndexes(settled)).toEqual([undefined, 2]);

    const result = preserveStreamedContentIdentity(settled, [text('intro'), tool('call_a')]);

    expect(streamedIndexes(result)).toEqual([undefined, 2]);
  });

  it('pairs id-less tool calls by name', () => {
    const streamed = [undefined, tool(undefined, 'execute_code')];
    const final = [tool(undefined, 'execute_code')];

    expect(streamedIndexes(preserveStreamedContentIdentity(streamed, final))).toEqual([1]);
  });

  it('abandons stamping when id-less tool call names differ', () => {
    const streamed = [undefined, tool(undefined, 'execute_code')];
    const final = [tool(undefined, 'web_search')];

    expect(preserveStreamedContentIdentity(streamed, final)).toBe(final);
  });
});
