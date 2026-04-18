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

  it('preserves chronological order when reasoning and text arrive interleaved (ordering regression)', () => {
    /**
     * Before the delta-type-switch close, a run where the LLM emitted
     * reasoning FIRST, then text, then a tool call would flush both
     * buffers at the tool_call boundary in a fixed (text, think) order —
     * landing text BEFORE think in the content array even though the
     * user observed reasoning first. Fix: when a text chunk arrives
     * close any open think buffer first, and vice versa.
     */
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'Let me think.' }] } },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Sure!' }] } },
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
    ]);
    expect(parts).toHaveLength(3);
    expect((parts[0] as { type: string; think?: string }).type).toBe(ContentTypes.THINK);
    expect((parts[0] as { think: string }).think).toBe('Let me think.');
    expect((parts[1] as { type: string; text?: string }).type).toBe(ContentTypes.TEXT);
    expect((parts[1] as { text: string }).text).toBe('Sure!');
    expect((parts[2] as { type: string }).type).toBe(ContentTypes.TOOL_CALL);
  });

  it('handles repeated reasoning → text → reasoning flows across a turn', () => {
    /** Second pattern from the screenshot: reasoning before the final
     *  text, and the completed run still ending with streaming text.
     *  A new reasoning after a text streak should appear AFTER the text,
     *  not before. */
    const parts = aggregateSubagentContent([
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'Pre-thinking.' }] } },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'First draft.' }] } },
      }),
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'Post-thinking.' }] } },
      }),
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Final.' }] } },
      }),
    ]);
    expect(parts.map((p) => (p as { type: string }).type)).toEqual([
      ContentTypes.THINK,
      ContentTypes.TEXT,
      ContentTypes.THINK,
      ContentTypes.TEXT,
    ]);
    expect((parts[0] as { think: string }).think).toBe('Pre-thinking.');
    expect((parts[1] as { text: string }).text).toBe('First draft.');
    expect((parts[2] as { think: string }).think).toBe('Post-thinking.');
    expect((parts[3] as { text: string }).text).toBe('Final.');
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

  it('produces a single writing line whose body extends as deltas arrive', () => {
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
    expect(lines[0]).toEqual({ kind: 'writing', body: 'Hello world' });
  });

  it('truncates the writing body to the tail when it grows past the cap', () => {
    const longText = 'x'.repeat(1000);
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: longText }] } },
      }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('writing');
    const body = (lines[0] as { body: string }).body;
    expect(body.startsWith('…')).toBe(true);
    /** Cap of 300 chars + leading ellipsis. Wide enough for wide
     *  containers; the component's CSS tail-ellipsis handles narrow
     *  viewports without losing the newest chars. */
    expect(body.length).toBeLessThanOrEqual(301);
    expect(body.length).toBeGreaterThan(60);
  });

  it('emits using_tool + tool_complete lines', () => {
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
      { kind: 'using_tool', toolNames: ['calculator'] },
      { kind: 'tool_complete', toolName: 'calculator', outputSnippet: '42*58 = 2436' },
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
    expect(single[0]).toEqual({
      kind: 'using_tool',
      toolNames: ['calculator'],
      argsSnippet: 'expression=42*58',
    });

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
    expect(parallel[0]).toEqual({
      kind: 'using_tool',
      toolNames: ['calculator', 'web_search'],
    });
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
    expect(lines[0].kind).toBe('tool_complete');
    const snippet = (lines[0] as { outputSnippet?: string }).outputSnippet ?? '';
    expect(snippet).toMatch(/^x+…$/);
    /** 48-char head + trailing ellipsis. */
    expect(snippet.length).toBe(49);
  });

  it('omits outputSnippet when output is empty', () => {
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
    expect(lines[0]).toEqual({ kind: 'tool_complete', toolName: 'noop' });
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
      { kind: 'writing', body: 'I will compute' },
      { kind: 'using_tool', toolNames: ['calculator'] },
      { kind: 'writing', body: 'Result: 4' },
    ]);
  });

  it('distinguishes reasoning from writing', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: 'think', think: 'Step 1' }] } },
      }),
    ]);
    expect(lines[0]).toEqual({ kind: 'reasoning', body: 'Step 1' });
  });

  it('surfaces error envelopes with their message', () => {
    const lines = buildSubagentTickerLines([
      makeEvent({ phase: 'error', data: { message: 'recursion limit' } }),
    ]);
    expect(lines).toEqual([{ kind: 'error', message: 'recursion limit' }]);
  });
});
