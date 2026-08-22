import { ContentTypes } from 'librechat-data-provider';
import type { SubagentUpdateEvent } from 'librechat-data-provider';
import { reduceSubagentProgress } from './subagents';

const update = (overrides: Partial<SubagentUpdateEvent> = {}): SubagentUpdateEvent => ({
  runId: 'root-run',
  parentRunId: 'parent-run',
  subagentRunId: 'child-run',
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
});
