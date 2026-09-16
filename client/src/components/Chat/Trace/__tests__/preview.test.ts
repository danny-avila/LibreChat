import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TTraceRecord } from 'librechat-data-provider';
import { buildPreviews, buildStepPreviews, previewFor } from '../preview';
import { buildTraceModel } from '../model';

const BASE = Date.UTC(2026, 8, 12, 11, 30, 0);
const at = (offsetMs: number) => new Date(BASE + offsetMs).toISOString();

function record(overrides: Partial<TTraceRecord> & Pick<TTraceRecord, 'id'>): TTraceRecord {
  return {
    traceId: 'trace-1',
    messageId: 'response-1',
    parentId: null,
    kind: 'span',
    name: overrides.id,
    startTime: at(0),
    endTime: at(1000),
    status: 'ok',
    ...overrides,
  };
}

function message(overrides: Partial<TMessage>): TMessage {
  return {
    messageId: 'response-1',
    conversationId: 'convo-1',
    parentMessageId: 'user-1',
    isCreatedByUser: false,
    text: '',
    ...overrides,
  } as TMessage;
}

const response = message({
  content: [
    { type: ContentTypes.THINK, think: 'Need the weather first.' },
    { type: ContentTypes.TEXT, text: 'Let me   check the weather\nfor you.' },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: { name: 'web_search', args: { query: 'weather in Paris', limit: 3 } },
    },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: { name: 'web_search', args: '{"query":"weather in Lyon"}' },
    },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'call-3',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"notes.md"}' },
      },
    },
    { type: ContentTypes.TEXT, text: { value: 'Paris is sunny, Lyon is not.' } },
  ],
} as Partial<TMessage>);

describe('buildStepPreviews', () => {
  it('splits a response into what each model call wrote and called', () => {
    expect(buildStepPreviews(response)).toEqual([
      {
        text: 'Let me check the weather for you.',
        toolCalls: [
          { name: 'web_search', args: 'query: weather in Paris, limit: 3' },
          { name: 'web_search', args: 'query: weather in Lyon' },
          { name: 'read_file', args: 'path: notes.md' },
        ],
      },
      { text: 'Paris is sunny, Lyon is not.', toolCalls: [] },
    ]);
  });

  it('falls back to the message text and bounds long previews', () => {
    const long = 'word '.repeat(100);
    expect(buildStepPreviews(message({ text: long }))).toEqual([
      { text: `${long.slice(0, 160).trimEnd()}…`, toolCalls: [] },
    ]);
    expect(buildStepPreviews(undefined)).toEqual([]);
  });
});

describe('previewFor', () => {
  const model = buildTraceModel([
    record({ id: 'llm-1', kind: 'generation', name: 'llm', startTime: at(0), endTime: at(1000) }),
    record({
      id: 'search-paris',
      kind: 'tool',
      name: 'web_search',
      startTime: at(1100),
      endTime: at(1500),
    }),
    record({
      id: 'search-lyon',
      kind: 'tool',
      name: 'web_search',
      startTime: at(1600),
      endTime: at(2000),
    }),
    record({ id: 'read', kind: 'tool', name: 'read_file', startTime: at(2100), endTime: at(2200) }),
    record({
      id: 'llm-2',
      kind: 'generation',
      name: 'llm',
      startTime: at(3000),
      endTime: at(4000),
    }),
    record({
      id: 'title',
      traceId: 'trace-title',
      kind: 'generation',
      name: 'llm',
      origin: 'title',
      startTime: at(4100),
      endTime: at(4200),
    }),
  ]);
  const previews = buildPreviews([
    message({ messageId: 'user-1', isCreatedByUser: true, text: 'Weather?' }),
    response,
  ]);
  const preview = (id: string) => previewFor(model.nodes.get(id) as never, model, previews);

  it('pairs each step with the text it wrote and each tool with the arguments it was given', () => {
    expect(preview('llm-1')).toBe('Let me check the weather for you.');
    expect(preview('search-paris')).toBe('query: weather in Paris, limit: 3');
    expect(preview('search-lyon')).toBe('query: weather in Lyon');
    expect(preview('read')).toBe('path: notes.md');
    expect(preview('llm-2')).toBe('Paris is sunny, Lyon is not.');
  });

  it('shows nothing for a title run, a record without a message, or a step the message lacks', () => {
    expect(preview('title')).toBeUndefined();
    expect(previewFor(model.nodes.get('llm-1') as never, model, new Map())).toBeUndefined();
    const extra = buildTraceModel([
      record({ id: 'a', kind: 'generation', startTime: at(0), endTime: at(1) }),
      record({ id: 'b', kind: 'generation', startTime: at(2), endTime: at(3) }),
      record({ id: 'c', kind: 'generation', startTime: at(4), endTime: at(5) }),
    ]);
    expect(previewFor(extra.nodes.get('c') as never, extra, previews)).toBeUndefined();
  });

  it('does not preview messages the user wrote', () => {
    expect(previews.has('user-1')).toBe(false);
  });
});
