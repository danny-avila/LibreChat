import { ContentTypes } from 'librechat-data-provider';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import { reduceSubagentProgress } from './subagents';

const update = (overrides: Partial<SubagentUpdateEvent> = {}): SubagentUpdateEvent => ({
  runId: 'root-run',
  parentRunId: 'parent-run',
  subagentRunId: 'child-run',
  activityEventId: 'activity-1',
  subagentType: 'researcher',
  subagentKind: 'agent',
  subagentAgentId: 'agent-1',
  parentToolCallId: 'tool-call',
  depth: 1,
  ancestry: [],
  phase: 'message_delta',
  data: { delta: { content: [{ type: 'text', text: 'Working.' }] } },
  label: 'Drafting the report',
  timestamp: '2026-08-21T20:00:00.000Z',
  ...overrides,
});

describe('reduceSubagentProgress', () => {
  it('folds an event delivered by both parent and detached streams only once', () => {
    const event = update();
    const first = reduceSubagentProgress(null, [event]);
    const replay = reduceSubagentProgress(first, [event]);

    expect(replay).toBe(first);
    expect(first?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'Working.' }]);
    expect(first?.tickerState.lines).toHaveLength(1);
  });

  it('preserves equal chunks that carry distinct host event identities', () => {
    const progress = reduceSubagentProgress(null, [
      update({ activityEventId: 'activity-1', activitySequence: 0 }),
      update({ activityEventId: 'activity-2', activitySequence: 1 }),
    ]);

    expect(progress?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'Working.Working.' }]);
  });

  it('orders a same-batch overlap by the host sequence before folding', () => {
    const progress = reduceSubagentProgress(null, [
      update({
        activityEventId: 'activity-2',
        activitySequence: 2,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'second' }] } },
      }),
      update({
        activityEventId: 'activity-1',
        activitySequence: 1,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'first ' }] } },
      }),
    ]);

    expect(progress?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'first second' }]);
    expect(progress?.lastActivitySequence).toBe(2);
  });

  it('rejects older overlap events and duplicates beyond the replay-key window', () => {
    const initial = reduceSubagentProgress(null, [
      update({
        activityEventId: 'activity-300',
        activitySequence: 300,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'latest' }] } },
      }),
    ]);
    const delayed = reduceSubagentProgress(initial, [
      update({
        activityEventId: 'activity-1',
        activitySequence: 1,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'old' }] } },
      }),
      update({
        activityEventId: 'activity-300',
        activitySequence: 300,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'duplicate' }] } },
      }),
    ]);

    expect(delayed).toBe(initial);
    expect(delayed?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'latest' }]);
  });

  it('preserves legacy unsequenced foreground updates', () => {
    const progress = reduceSubagentProgress(null, [
      update({ activityEventId: undefined, activitySequence: undefined }),
      update({ activityEventId: undefined, activitySequence: undefined }),
    ]);

    expect(progress?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'Working.Working.' }]);
    expect(progress?.lastActivitySequence).toBeUndefined();
  });

  it('preserves a reasoning activity marker without retaining private reasoning text', () => {
    const progress = reduceSubagentProgress(null, [
      update({
        phase: 'reasoning_delta',
        data: undefined,
        label: 'Reasoning',
      }),
    ]);

    expect(progress?.contentParts).toEqual([{ type: ContentTypes.THINK, think: '…' }]);
    expect(progress?.tickerState.lines).toEqual([
      expect.objectContaining({ kind: 'reasoning', body: '…' }),
    ]);
    expect(JSON.stringify(progress)).not.toContain('private');
  });

  it('bounds accumulated live text to the durable activity byte budget', () => {
    const progress = reduceSubagentProgress(null, [
      update({
        activityEventId: 'large-activity',
        data: { delta: { content: [{ type: 'text', text: 'x'.repeat(96 * 1024) }] } },
      }),
    ]);

    expect(
      new TextEncoder().encode(JSON.stringify(progress?.contentParts)).byteLength,
    ).toBeLessThanOrEqual(64 * 1024);
    expect(progress?.contentParts[0]).toEqual(expect.objectContaining({ type: ContentTypes.TEXT }));
  });

  it('retains an encoded-byte-bounded singleton containing escaped text', () => {
    const progress = reduceSubagentProgress(null, [
      update({
        activityEventId: 'escaped-activity',
        data: { delta: { content: [{ type: 'text', text: '\\"'.repeat(48 * 1024) }] } },
      }),
    ]);

    expect(progress?.contentParts).toHaveLength(1);
    expect(progress?.contentParts[0]).toEqual(expect.objectContaining({ type: ContentTypes.TEXT }));
    expect(
      new TextEncoder().encode(JSON.stringify(progress?.contentParts)).byteLength,
    ).toBeLessThanOrEqual(64 * 1024);
  });

  it('retains an encoded-byte-bounded singleton tool projection', () => {
    const progress = reduceSubagentProgress(null, [
      update({
        activityEventId: 'escaped-tool-start',
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'tool', name: 'search', args: '\\"'.repeat(48 * 1024) }],
          },
        },
      }),
      update({
        activityEventId: 'escaped-tool-complete',
        phase: 'run_step_completed',
        data: {
          result: {
            type: 'tool_call',
            tool_call: {
              id: 'tool',
              name: 'search',
              output: '\\\\'.repeat(48 * 1024),
              progress: 1,
            },
          },
        },
      }),
    ]);

    expect(progress?.contentParts).toHaveLength(1);
    expect(progress?.contentParts[0]).toEqual(
      expect.objectContaining({ type: ContentTypes.TOOL_CALL }),
    );
    expect(
      new TextEncoder().encode(JSON.stringify(progress?.contentParts)).byteLength,
    ).toBeLessThanOrEqual(64 * 1024);
  });

  it('keeps only the newest bounded activity and continues folding afterward', () => {
    const toolEvents = Array.from({ length: 120 }, (_, index) =>
      update({
        activityEventId: `tool-${index}`,
        phase: 'run_step',
        data: {
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: `call-${index}`, name: 'search', args: { index } }],
          },
        },
      }),
    );
    const bounded = reduceSubagentProgress(null, toolEvents);
    const continued = reduceSubagentProgress(bounded, [
      update({
        activityEventId: 'after-bound',
        phase: 'message_delta',
        data: { delta: { content: [{ type: 'text', text: 'Final answer.' }] } },
      }),
    ]);

    expect(bounded?.contentParts).toHaveLength(100);
    expect(continued?.contentParts).toHaveLength(100);
    expect(continued?.contentParts.at(-1)).toEqual({
      type: ContentTypes.TEXT,
      text: 'Final answer.',
    });
    expect(continued?.tickerState.lines.length).toBeLessThanOrEqual(100);
  });
});
