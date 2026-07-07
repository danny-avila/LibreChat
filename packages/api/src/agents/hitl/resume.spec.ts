import type { Agents } from 'librechat-data-provider';
import {
  mapToolApprovalResolutions,
  mapAskUserAnswer,
  findUndecidedToolCalls,
  findDisallowedDecisions,
  findIncompleteDecisions,
  createContentIndexOffsetHandlers,
} from './resume';

describe('mapToolApprovalResolutions', () => {
  test('maps each decision type to the SDK discriminated shape, keyed by tool_call_id', () => {
    const resolutions: Agents.ToolApprovalResolution[] = [
      { tool_call_id: 'a', decision: 'approve' },
      { tool_call_id: 'b', decision: 'reject', reason: 'no' },
      { tool_call_id: 'c', decision: 'edit', editedArguments: { x: 1 } },
      { tool_call_id: 'd', decision: 'respond', responseText: 'done' },
    ];

    expect(mapToolApprovalResolutions(resolutions)).toEqual({
      a: { type: 'approve' },
      b: { type: 'reject', reason: 'no' },
      c: { type: 'edit', updatedInput: { x: 1 } },
      d: { type: 'respond', responseText: 'done' },
    });
  });

  test('defaults missing edit args to {} and missing respond text to "" rather than throwing', () => {
    const resolutions: Agents.ToolApprovalResolution[] = [
      { tool_call_id: 'a', decision: 'edit' },
      { tool_call_id: 'b', decision: 'respond' },
    ];
    expect(mapToolApprovalResolutions(resolutions)).toEqual({
      a: { type: 'edit', updatedInput: {} },
      b: { type: 'respond', responseText: '' },
    });
  });

  test('fails closed (reject) on an unrecognized decision', () => {
    const resolutions = [
      { tool_call_id: 'a', decision: 'nonsense' as Agents.ToolApprovalDecisionType },
    ];
    expect(mapToolApprovalResolutions(resolutions)).toEqual({
      a: { type: 'reject', reason: 'Unrecognized approval decision' },
    });
  });

  test('last write wins when the same tool_call_id appears twice', () => {
    const resolutions: Agents.ToolApprovalResolution[] = [
      { tool_call_id: 'a', decision: 'approve' },
      { tool_call_id: 'a', decision: 'reject' },
    ];
    expect(mapToolApprovalResolutions(resolutions)).toEqual({ a: { type: 'reject' } });
  });
});

describe('mapAskUserAnswer', () => {
  test('passes the answer through unchanged', () => {
    expect(mapAskUserAnswer({ answer: 'staging' })).toEqual({ answer: 'staging' });
  });
});

describe('findUndecidedToolCalls', () => {
  const payload: Agents.ToolApprovalInterruptPayload = {
    type: 'tool_approval',
    action_requests: [
      { tool_call_id: 'a', name: 'read', arguments: {} },
      { tool_call_id: 'b', name: 'write', arguments: {} },
    ],
    review_configs: [],
  };

  test('returns the tool_call_ids with no decision', () => {
    expect(findUndecidedToolCalls(payload, [{ tool_call_id: 'a', decision: 'approve' }])).toEqual([
      'b',
    ]);
  });

  test('returns [] when every requested tool call is decided', () => {
    expect(
      findUndecidedToolCalls(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'reject' },
      ]),
    ).toEqual([]);
  });

  test('ignores resolutions for tool calls not in the action', () => {
    expect(
      findUndecidedToolCalls(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'approve' },
        { tool_call_id: 'z', decision: 'approve' },
      ]),
    ).toEqual([]);
  });
});

describe('findDisallowedDecisions', () => {
  const payload: Agents.ToolApprovalInterruptPayload = {
    type: 'tool_approval',
    action_requests: [
      { tool_call_id: 'a', name: 'read', arguments: {} },
      { tool_call_id: 'b', name: 'write', arguments: {} },
    ],
    review_configs: [
      { action_name: 'read', tool_call_id: 'a', allowed_decisions: ['approve', 'reject'] },
      { action_name: 'write', tool_call_id: 'b', allowed_decisions: ['reject', 'respond'] },
    ],
  };

  test('returns [] when every decision is permitted by its review config', () => {
    expect(
      findDisallowedDecisions(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'respond', responseText: 'x' },
      ]),
    ).toEqual([]);
  });

  test('flags a decision the policy does not allow for that tool', () => {
    // `b` is restricted to reject/respond — approving it must be rejected.
    expect(
      findDisallowedDecisions(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'approve' },
      ]),
    ).toEqual(['b']);
  });

  test('fails closed for a tool_call_id with no matching review config', () => {
    expect(findDisallowedDecisions(payload, [{ tool_call_id: 'z', decision: 'approve' }])).toEqual([
      'z',
    ]);
  });
});

describe('findIncompleteDecisions', () => {
  it('flags an edit decision without editedArguments', () => {
    expect(findIncompleteDecisions([{ tool_call_id: 'a', decision: 'edit' }])).toEqual(['a']);
  });

  it('flags an edit decision whose editedArguments is not a plain object', () => {
    expect(
      findIncompleteDecisions([
        {
          tool_call_id: 'a',
          decision: 'edit',
          editedArguments: [] as unknown as Record<string, unknown>,
        },
      ]),
    ).toEqual(['a']);
  });

  it('flags a respond decision without responseText (or empty)', () => {
    expect(findIncompleteDecisions([{ tool_call_id: 'a', decision: 'respond' }])).toEqual(['a']);
    expect(
      findIncompleteDecisions([{ tool_call_id: 'b', decision: 'respond', responseText: '' }]),
    ).toEqual(['b']);
  });

  it('accepts complete edit/respond and ignores approve/reject', () => {
    expect(
      findIncompleteDecisions([
        { tool_call_id: 'a', decision: 'edit', editedArguments: { q: 1 } },
        { tool_call_id: 'b', decision: 'respond', responseText: 'done' },
        { tool_call_id: 'c', decision: 'approve' },
        { tool_call_id: 'd', decision: 'reject', reason: 'no' },
      ]),
    ).toEqual([]);
  });
});

describe('createContentIndexOffsetHandlers', () => {
  const makeRecorder = () => {
    const calls: Array<{ event: string; data: unknown }> = [];
    const handler = { handle: (event: string, data: unknown) => void calls.push({ event, data }) };
    return { calls, handler };
  };

  it('returns the input untouched for offset 0 / undefined handlers', () => {
    const { handler } = makeRecorder();
    const handlers = { on_run_step: handler };
    expect(createContentIndexOffsetHandlers(handlers, 0)).toBe(handlers);
    expect(createContentIndexOffsetHandlers(undefined, 3)).toBeUndefined();
  });

  it('shifts ON_RUN_STEP index by the offset without mutating the original payload', () => {
    const { calls, handler } = makeRecorder();
    const wrapped = createContentIndexOffsetHandlers({ on_run_step: handler }, 3)!;
    const runStep = { id: 'step_1', index: 0, stepDetails: { type: 'message_creation' } };
    wrapped.on_run_step.handle('on_run_step', runStep as never);
    expect((calls[0].data as { index: number }).index).toBe(3);
    expect(runStep.index).toBe(0); // caller's object untouched
  });

  it('shifts ON_AGENT_UPDATE nested index', () => {
    const { calls, handler } = makeRecorder();
    const wrapped = createContentIndexOffsetHandlers({ on_agent_update: handler }, 2)!;
    wrapped.on_agent_update.handle('on_agent_update', {
      agent_update: { index: 1, runId: 'r' },
    } as never);
    expect((calls[0].data as { agent_update: { index: number } }).agent_update.index).toBe(3);
  });

  it('passes every other event handler through by reference (stateful instances intact)', () => {
    const { handler } = makeRecorder();
    const deltaHandler = { handle: jest.fn() };
    const wrapped = createContentIndexOffsetHandlers(
      { on_run_step: handler, on_message_delta: deltaHandler },
      5,
    )!;
    expect(wrapped.on_message_delta).toBe(deltaHandler);
    // Deltas carry no index — they resolve through the (shifted) stepMap entry.
    wrapped.on_message_delta.handle('on_message_delta', { id: 'step_1', delta: {} } as never);
    expect(deltaHandler.handle).toHaveBeenCalledTimes(1);
  });

  it('leaves a runStep without a numeric index unshifted (defensive)', () => {
    const { calls, handler } = makeRecorder();
    const wrapped = createContentIndexOffsetHandlers({ on_run_step: handler }, 4)!;
    const weird = { id: 'step_x' };
    wrapped.on_run_step.handle('on_run_step', weird as never);
    expect(calls[0].data).toBe(weird);
  });
});
