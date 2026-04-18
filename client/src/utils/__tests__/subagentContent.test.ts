import { ContentTypes } from 'librechat-data-provider';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import { aggregateSubagentContent, buildSubagentTickerLines } from '../subagentContent';

const makeEvent = (overrides: Partial<SubagentUpdateEvent>): SubagentUpdateEvent => ({
  runId: 'parent-run',
  subagentRunId: 'child-run',
  subagentType: 'self',
  subagentAgentId: 'child',
  parentAgentId: 'parent',
  phase: 'start',
  timestamp: '2026-04-17T00:00:00Z',
  ...overrides,
});

describe('aggregateSubagentContent', () => {
  it('returns empty array for no events', () => {
    expect(aggregateSubagentContent([])).toEqual([]);
  });

  it('concatenates adjacent message_delta chunks into a single TEXT part', () => {
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Hello ' }] } },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'world' }] } },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: '!' }] } },
      }),
    ]);
    expect(parts).toEqual([{ type: ContentTypes.TEXT, text: 'Hello world!' }]);
  });

  it('concatenates reasoning_delta chunks into a single THINK part', () => {
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'Let me ' }] } },
      }),
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'compute…' }] } },
      }),
    ]);
    expect(parts).toEqual([{ type: ContentTypes.THINK, think: 'Let me compute…' }]);
  });

  it('creates a TOOL_CALL part for each unique tool_call id on run_step', () => {
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [
              { id: 'call_1', name: 'calculator', args: '{"expression":"1+1"}' },
              { id: 'call_2', name: 'web_search', args: '{"query":"x"}' },
            ],
          },
        },
      }),
    ]);
    expect(parts).toHaveLength(2);
    expect((parts[0] as { tool_call: { name: string; progress: number } }).tool_call.name).toBe(
      'calculator',
    );
    expect((parts[1] as { tool_call: { name: string; progress: number } }).tool_call.name).toBe(
      'web_search',
    );
    expect((parts[0] as { tool_call: { progress: number } }).tool_call.progress).toBe(0.1);
  });

  it('finalizes a TOOL_CALL part on run_step_completed with output and progress=1', () => {
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'call_1', name: 'calculator', args: '{}' }],
          },
        },
      }),
      makeEvent({
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'calculator',
              args: '{"expression":"1+1"}',
              output: '1+1 = 2',
              progress: 1,
            },
          },
        },
      }),
    ]);
    expect(parts).toHaveLength(1);
    const tc = (parts[0] as { tool_call: { output?: string; progress: number } }).tool_call;
    expect(tc.output).toBe('1+1 = 2');
    expect(tc.progress).toBe(1);
  });

  it('interleaves tool calls between text parts in order', () => {
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Computing…' }] } },
      }),
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'c1', name: 'calculator', args: '{}' }],
          },
        },
      }),
      makeEvent({
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: { id: 'c1', name: 'calculator', output: '4', progress: 1 },
          },
        },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'The answer is 4.' }] } },
      }),
    ]);
    expect(parts).toHaveLength(3);
    expect((parts[0] as { type: string }).type).toBe(ContentTypes.TEXT);
    expect((parts[1] as { type: string }).type).toBe(ContentTypes.TOOL_CALL);
    expect((parts[2] as { type: string }).type).toBe(ContentTypes.TEXT);
    expect((parts[2] as { text: string }).text).toBe('The answer is 4.');
  });

  it('ignores start, stop, error, and run_step_delta phases', () => {
    const parts = aggregateSubagentContent([
      makeEvent({ phase: 'start' }),
      makeEvent({ phase: 'run_step_delta' }),
      makeEvent({ phase: 'stop' }),
      makeEvent({ phase: 'error', data: { message: 'boom' } }),
    ]);
    expect(parts).toEqual([]);
  });

  it('handles a run_step_completed without a preceding run_step (late arrival)', () => {
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: { id: 'c1', name: 'web', output: 'x', progress: 1 },
          },
        },
      }),
    ]);
    expect(parts).toHaveLength(1);
    const tc = (parts[0] as { tool_call: { output?: string } }).tool_call;
    expect(tc.output).toBe('x');
  });
});

describe('buildSubagentTickerLines', () => {
  it('returns empty array when no meaningful events are present', () => {
    expect(
      buildSubagentTickerLines([
        makeEvent({ phase: 'start' }),
        makeEvent({ phase: 'run_step_delta' }),
        makeEvent({ phase: 'stop' }),
      ]),
    ).toEqual([]);
  });

  it('produces a single live "Writing" line that updates as deltas arrive', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Hello ' }] } },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'world' }] } },
      }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: 'Writing: Hello world', live: true });
  });

  it('truncates the writing preview to the tail when it grows past 60 chars', () => {
    const longText = 'x'.repeat(200);
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: longText }] } },
      }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text.startsWith('Writing: …')).toBe(true);
    expect(lines[0].text.length).toBeLessThanOrEqual('Writing: …'.length + 60);
  });

  it('emits discrete lines for tool-call start and completion with output snippet', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'c1', name: 'calculator' }],
          },
        },
      }),
      makeEvent({
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: { id: 'c1', name: 'calculator', output: '42*58 = 2436', progress: 1 },
          },
        },
      }),
    ]);
    expect(lines).toEqual([
      { text: 'Using tool: calculator' },
      { text: 'calculator → 42*58 = 2436' },
    ]);
  });

  it('includes an args snippet for single tool_calls and drops it for parallel', () => {
    const single = buildSubagentTickerLines([
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'c1', name: 'calculator', args: '{"expression":"42*58"}' }],
          },
        },
      }),
    ]);
    expect(single[0].text).toBe('Using calculator(expression=42*58)');

    const parallel = buildSubagentTickerLines([
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [
              { id: 'c1', name: 'calculator', args: '{"expression":"42*58"}' },
              { id: 'c2', name: 'web_search', args: '{"query":"weather"}' },
            ],
          },
        },
      }),
    ]);
    expect(parallel[0].text).toBe('Using tool: calculator, web_search');
  });

  it('truncates long tool output to a 48-char head snippet', () => {
    const bigOutput = 'x'.repeat(500);
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: { id: 'c1', name: 'reader', output: bigOutput, progress: 1 },
          },
        },
      }),
    ]);
    expect(lines[0].text).toMatch(/^reader → x+…$/);
    /** 48-char snippet + "reader → " prefix (9 chars) + trailing "…". */
    expect(lines[0].text.length).toBe(9 + 48 + 1);
  });

  it('falls back to generic complete label when output is empty', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: { id: 'c1', name: 'noop', output: '', progress: 1 },
          },
        },
      }),
    ]);
    expect(lines[0].text).toBe('Tool noop complete');
  });

  it('closes a streaming line when a tool call arrives so subsequent deltas start fresh', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'I will compute' }] } },
      }),
      makeEvent({
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'c1', name: 'calculator' }],
          },
        },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Result: 4' }] } },
      }),
    ]);
    expect(lines).toEqual([
      { text: 'Writing: I will compute', live: true },
      /** No args present → generic label. */
      { text: 'Using tool: calculator' },
      { text: 'Writing: Result: 4', live: true },
    ]);
  });

  it('prefixes reasoning deltas distinctly from message deltas', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'Step 1' }] } },
      }),
    ]);
    expect(lines[0]).toEqual({ text: 'Reasoning: Step 1', live: true });
  });

  it('surfaces error envelopes with their message', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({ phase: 'error', data: { message: 'recursion limit' } }),
    ]);
    expect(lines).toEqual([{ text: 'Error: recursion limit' }]);
  });

  it('accepts host-supplied label formatters for i18n', () => {
    const lines = buildSubagentTickerLines(
      [
        makeEvent({
          phase: 'run_step',
          data: {
            stepDetails: {
              type: 'tool_calls',
              tool_calls: [{ id: 'c1', name: 'calculator' }],
            },
          },
        }),
      ],
      {
        formatUsingTool: (names, args) => (args ? `outil ${names}(${args})` : `outil : ${names}`),
      },
    );
    expect(lines[0].text).toBe('outil : calculator');
  });
});
