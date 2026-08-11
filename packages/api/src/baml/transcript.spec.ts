import type { BamlTranscriptEntry } from '@librechat/agents/baml';
import {
  MAX_TOOL_RESULT_CHARS,
  MAX_TRANSCRIPT_ENTRIES,
  MAX_TRANSCRIPT_TEXT_CHARS,
  TRANSCRIPT_TOO_LARGE_MESSAGE,
} from './protocol';
import { projectTranscript, type TranscriptProjection } from './transcript';

const successfulProjection = (entries: readonly BamlTranscriptEntry[]): TranscriptProjection => {
  const result = projectTranscript(entries);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected transcript projection to succeed');
  }
  return result.value;
};

const expectTooLarge = (entries: readonly BamlTranscriptEntry[]): void => {
  expect(projectTranscript(entries)).toStrictEqual({
    ok: false,
    failure: {
      code: 'schema_mismatch',
      message: TRANSCRIPT_TOO_LARGE_MESSAGE,
    },
  });
};

describe('BAML transcript projection', () => {
  it('uses one forward association pass and preserves tool-result order and call identity', () => {
    const source: BamlTranscriptEntry[] = [
      { role: 'user', content: 'compare both' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call-a', name: 'lookup', args: { slot: 'first' } },
          { id: 'call-b', name: 'lookup', args: { slot: 'second' } },
        ],
      },
      { role: 'tool', content: 'second-result', toolCallId: 'call-b' },
      { role: 'assistant', content: 'between results' },
      { role: 'tool', content: 'first-result', toolCallId: 'call-a' },
      { role: 'user', content: 'continue' },
    ];
    let iteratorPasses = 0;
    const entries = new Proxy(source, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          iteratorPasses += 1;
          if (iteratorPasses > 1) {
            throw new Error('transcript entries were iterated more than once');
          }
        }
        if (property === 'find' || property === 'findIndex' || property === 'filter') {
          throw new Error(`quadratic transcript lookup attempted through ${property}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const projection = successfulProjection(entries);

    expect(iteratorPasses).toBe(1);
    expect(projection.userMessage).toBe('continue');
    expect(projection.transcript.split('\n')).toStrictEqual([
      'user: compare both',
      'assistant: ',
      '<tool_result name="lookup" args={"slot":"second"}>second-result</tool_result>',
      'assistant: between results',
      '<tool_result name="lookup" args={"slot":"first"}>first-result</tool_result>',
      'user: continue',
    ]);
  });

  it('accepts exactly the entry limit and rejects one entry above it', () => {
    const entry: BamlTranscriptEntry = { role: 'system', content: '' };
    const atLimit = Array.from({ length: MAX_TRANSCRIPT_ENTRIES }, () => entry);
    const aboveLimit = [...atLimit, entry];

    expect(successfulProjection(atLimit).transcript.split('\n')).toHaveLength(
      MAX_TRANSCRIPT_ENTRIES,
    );
    expectTooLarge(aboveLimit);
  });

  it('accepts an output exactly at the total text limit in JavaScript code units', () => {
    const prefix = 'user: ';
    const content = 'x'.repeat(MAX_TRANSCRIPT_TEXT_CHARS - prefix.length);

    const projection = successfulProjection([{ role: 'user', content }]);

    expect(projection.transcript.length).toBe(MAX_TRANSCRIPT_TEXT_CHARS);
    expect(projection.userMessage).toBe(content);
  });

  it('rejects a constructed transcript one code unit above the total text limit', () => {
    expect.hasAssertions();
    const prefix = 'user: ';
    const content = 'x'.repeat(MAX_TRANSCRIPT_TEXT_CHARS - prefix.length + 1);

    expectTooLarge([{ role: 'user', content }]);
  });

  it('counts separators in the total constructed transcript limit', () => {
    expect.hasAssertions();
    const firstPrefix = 'system: ';
    const secondLine = 'user: z';
    const first = 'x'.repeat(
      MAX_TRANSCRIPT_TEXT_CHARS - firstPrefix.length - 1 - secondLine.length + 1,
    );

    expectTooLarge([
      { role: 'system', content: first },
      { role: 'user', content: 'z' },
    ]);
  });

  it('accepts exactly the tool-result limit and rejects one code unit above it', () => {
    const call: BamlTranscriptEntry = {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call-1', name: 'lookup', args: { query: 'bounded' } }],
    };

    expect(
      successfulProjection([
        call,
        {
          role: 'tool',
          content: 'x'.repeat(MAX_TOOL_RESULT_CHARS),
          toolCallId: 'call-1',
        },
      ]).transcript,
    ).toContain(`>${'x'.repeat(MAX_TOOL_RESULT_CHARS)}</tool_result>`);

    expectTooLarge([
      call,
      {
        role: 'tool',
        content: 'x'.repeat(MAX_TOOL_RESULT_CHARS + 1),
        toolCallId: 'call-1',
      },
    ]);
  });

  it('measures strings as JavaScript UTF-16 code units', () => {
    const emoji = '😀';
    const projection = successfulProjection([{ role: 'user', content: emoji }]);

    expect(emoji.length).toBe(2);
    expect(projection.transcript.length).toBe('user: '.length + 2);
  });
});
