import { ContentTypes } from 'librechat-data-provider';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import { closeParentSubagentProgress, reduceSubagentProgress } from './subagents';

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

  it('marks an accepted run-start frame complete regardless of its delivery transport', () => {
    const progress = reduceSubagentProgress(
      null,
      [update({ activitySequence: 0 })],
      'detached',
      false,
    );

    expect(progress?.coverage).toBe('complete');
  });

  it('orders a same-batch overlap by the host sequence before folding', () => {
    const progress = reduceSubagentProgress(
      null,
      [
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
      ],
      'detached',
      false,
    );

    expect(progress?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'first second' }]);
    expect(progress?.lastActivitySequence).toBe(2);
  });

  it('rejects older overlap events and duplicates beyond the replay-key window', () => {
    const initial = reduceSubagentProgress(
      null,
      [
        update({
          activityEventId: 'activity-300',
          activitySequence: 300,
          data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'latest' }] } },
        }),
      ],
      'detached',
      false,
    );
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

  it('buffers a detached frame until a lagging parent delivers the missing sequence', () => {
    const detached = reduceSubagentProgress(
      null,
      [
        update({
          activityEventId: 'activity-1',
          activitySequence: 1,
          data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'second' }] } },
        }),
      ],
      'detached',
      true,
    );
    expect(detached?.contentParts).toEqual([]);
    expect(detached?.pendingSequencedEvents).toHaveLength(1);

    const ordered = reduceSubagentProgress(detached, [
      update({
        activityEventId: 'activity-0',
        activitySequence: 0,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'first ' }] } },
      }),
    ]);

    expect(ordered?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'first second' }]);
    expect(ordered?.pendingSequencedEvents).toBeUndefined();
    expect(ordered?.lastActivitySequence).toBe(1);
    expect(ordered?.coverage).toBe('complete');
  });

  it('uses parent stream closure as the fence for a detached suffix with no earlier frame', () => {
    const waiting = reduceSubagentProgress(
      null,
      [
        update({
          activityEventId: 'activity-5',
          activitySequence: 5,
          data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'suffix' }] } },
        }),
      ],
      'detached',
      true,
    );

    const closed = closeParentSubagentProgress(waiting);

    expect(closed?.contentParts).toEqual([{ type: ContentTypes.TEXT, text: 'suffix' }]);
    expect(closed?.pendingSequencedEvents).toBeUndefined();
    expect(closed?.lastActivitySequence).toBe(5);

    const afterMissedFrames = reduceSubagentProgress(
      closed,
      [
        update({
          activityEventId: 'activity-8',
          activitySequence: 8,
          data: { delta: { content: [{ type: ContentTypes.TEXT, text: ' resumed' }] } },
        }),
      ],
      'detached',
      false,
    );
    expect(afterMissedFrames?.contentParts).toEqual([
      { type: ContentTypes.TEXT, text: 'suffix resumed' },
    ]);
    expect(afterMissedFrames?.lastActivitySequence).toBe(8);
  });

  it('bounds future sequence buffering while an earlier parent frame is missing', () => {
    const waiting = reduceSubagentProgress(
      null,
      Array.from({ length: 140 }, (_, index) =>
        update({
          activityEventId: `activity-${index + 1}`,
          activitySequence: index + 1,
          data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'x'.repeat(2048) }] } },
        }),
      ),
      'detached',
      true,
    );

    expect(waiting?.pendingSequencedEvents?.length).toBeLessThanOrEqual(100);
    expect(
      new TextEncoder().encode(JSON.stringify(waiting?.pendingSequencedEvents)).byteLength,
    ).toBeLessThanOrEqual(128 * 1024);
  });

  it('accepts the missing expected frame even when the future-frame buffer is full', () => {
    const waiting = reduceSubagentProgress(
      null,
      Array.from({ length: 100 }, (_, index) =>
        update({
          activityEventId: `activity-${index + 1}`,
          activitySequence: index + 1,
          data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'x' }] } },
        }),
      ),
      'detached',
      true,
    );

    expect(waiting?.pendingSequencedEvents).toHaveLength(100);

    const ordered = reduceSubagentProgress(waiting, [
      update({
        activityEventId: 'activity-0',
        activitySequence: 0,
        data: { delta: { content: [{ type: ContentTypes.TEXT, text: 'first-' }] } },
      }),
    ]);

    expect(ordered?.contentParts).toEqual([
      { type: ContentTypes.TEXT, text: `first-${'x'.repeat(100)}` },
    ]);
    expect(ordered?.pendingSequencedEvents).toBeUndefined();
    expect(ordered?.lastActivitySequence).toBe(100);
    expect(ordered?.coverage).toBe('complete');
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
    const progress = reduceSubagentProgress(
      null,
      [
        update({
          activitySequence: 0,
          phase: 'reasoning_delta',
          data: { delta: { content: [{ type: ContentTypes.THINK, think: 'private' }] } },
          label: 'Reasoning',
        }),
      ],
      'detached',
      false,
    );

    expect(progress?.contentParts).toEqual([{ type: ContentTypes.THINK, think: '…' }]);
    expect(progress?.tickerState.lines).toEqual([
      expect.objectContaining({ kind: 'reasoning', body: '…' }),
    ]);
    expect(JSON.stringify(progress)).not.toContain('private');
  });

  it('preserves visible reasoning on the authoritative parent delivery path', () => {
    const progress = reduceSubagentProgress(null, [
      update({
        activitySequence: 0,
        phase: 'reasoning_delta',
        data: { delta: { content: [{ type: ContentTypes.THINK, think: 'Visible reasoning' }] } },
        label: 'Reasoning',
      }),
    ]);

    expect(progress?.contentParts).toEqual([
      { type: ContentTypes.THINK, think: 'Visible reasoning' },
    ]);
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
