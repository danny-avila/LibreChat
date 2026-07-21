import type { Agents } from 'librechat-data-provider';
import {
  mapToolApprovalResolutions,
  mapAskUserAnswer,
  findUndecidedToolCalls,
  findDisallowedDecisions,
  findIncompleteDecisions,
  createContentIndexOffsetHandlers,
  attachAskUserQuestionAnswer,
  attachAskUserQuestionArgs,
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
  const textSeed = (n: number) => Array.from({ length: n }, () => ({ type: 'text' }));
  const makeRecorder = () => {
    const calls: Array<{ event: string; data: unknown }> = [];
    const handler = { handle: (event: string, data: unknown) => void calls.push({ event, data }) };
    return { calls, handler };
  };

  it('returns the input untouched for offset 0 / undefined handlers', () => {
    const { handler } = makeRecorder();
    const handlers = { on_run_step: handler };
    expect(createContentIndexOffsetHandlers(handlers, [])).toBe(handlers);
    expect(createContentIndexOffsetHandlers(undefined, textSeed(3))).toBeUndefined();
  });

  it('shifts ON_RUN_STEP index by the offset without mutating the original payload', () => {
    const { calls, handler } = makeRecorder();
    const wrapped = createContentIndexOffsetHandlers({ on_run_step: handler }, textSeed(3))!;
    const runStep = { id: 'step_1', index: 0, stepDetails: { type: 'message_creation' } };
    wrapped.on_run_step.handle('on_run_step', runStep as never);
    expect((calls[0].data as { index: number }).index).toBe(3);
    expect(runStep.index).toBe(0); // caller's object untouched
  });

  it('shifts ON_AGENT_UPDATE nested index', () => {
    const { calls, handler } = makeRecorder();
    const wrapped = createContentIndexOffsetHandlers({ on_agent_update: handler }, textSeed(2))!;
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
      textSeed(5),
    )!;
    expect(wrapped.on_message_delta).toBe(deltaHandler);
    // Deltas carry no index — they resolve through the (shifted) stepMap entry.
    wrapped.on_message_delta.handle('on_message_delta', { id: 'step_1', delta: {} } as never);
    expect(deltaHandler.handle).toHaveBeenCalledTimes(1);
  });

  it('rebinds a resumed tool step to its seeded unresolved slot by tool_call id', () => {
    const { calls, handler } = makeRecorder();
    const seed = [
      { type: 'text' },
      { type: 'tool_call', tool_call: { id: 'tc_paused', output: '' } },
      { type: 'tool_call', tool_call: { id: 'tc_done', output: 'already resolved' } },
    ];
    const wrapped = createContentIndexOffsetHandlers({ on_run_step: handler }, seed)!;

    // The paused call's re-execution must land on its seeded slot (1), not 0+3.
    wrapped.on_run_step.handle('on_run_step', {
      id: 'step_t',
      index: 0,
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'tc_paused' }] },
    } as never);
    expect((calls[0].data as { index: number }).index).toBe(1);

    // Resolved seeded calls rebind too: ids are minted per call, so a same-id
    // step can only be the interrupted batch re-executing (e.g. an ask part
    // whose answer the resume controller pre-stamped onto the seed).
    wrapped.on_run_step.handle('on_run_step', {
      id: 'step_u',
      index: 1,
      stepDetails: { type: 'tool_calls', tool_calls: [{ id: 'tc_done' }] },
    } as never);
    expect((calls[1].data as { index: number }).index).toBe(2);

    // Message steps always offset.
    wrapped.on_run_step.handle('on_run_step', {
      id: 'step_m',
      index: 2,
      stepDetails: { type: 'message_creation' },
    } as never);
    expect((calls[2].data as { index: number }).index).toBe(5);
  });

  it('leaves a runStep without a numeric index unshifted (defensive)', () => {
    const { calls, handler } = makeRecorder();
    const wrapped = createContentIndexOffsetHandlers({ on_run_step: handler }, textSeed(4))!;
    const weird = { id: 'step_x' };
    wrapped.on_run_step.handle('on_run_step', weird as never);
    expect(calls[0].data).toBe(weird);
  });
});

describe('attachAskUserQuestionAnswer', () => {
  const question = { question: 'Which env?', options: [{ label: 'Staging', value: 'staging' }] };
  const askPart = (output?: string) => ({
    type: 'tool_call',
    tool_call: {
      id: 'tc1',
      name: 'ask_user_question',
      args: '',
      ...(output != null && { output }),
    },
  });

  it('stamps args (the authoritative question) and output (the answer) onto the last unanswered ask part', () => {
    const content = [{ type: 'text' } as never, askPart()];
    const next = attachAskUserQuestionAnswer(content as never, question as never, 'staging');
    expect(next).not.toBe(content);
    const patched = (next[1] as { tool_call: Record<string, unknown> }).tool_call;
    expect(patched.output).toBe('staging');
    expect(patched.progress).toBe(1);
    expect(JSON.parse(patched.args as string)).toEqual(question);
    // original untouched (pure)
    expect((content[1] as { tool_call: { output?: string } }).tool_call.output).toBeUndefined();
  });

  it('skips already-answered ask parts and targets the newest unanswered one', () => {
    const content = [askPart('earlier answer'), askPart()];
    const next = attachAskUserQuestionAnswer(content as never, question as never, 'blue');
    expect((next[0] as { tool_call: { output: string } }).tool_call.output).toBe('earlier answer');
    expect((next[1] as { tool_call: { output: string } }).tool_call.output).toBe('blue');
  });

  it('returns the input array untouched when no ask part matches', () => {
    const content = [{ type: 'text' } as never, askPart('done')];
    expect(attachAskUserQuestionAnswer(content as never, question as never, 'x')).toBe(content);
  });
});

describe('attachAskUserQuestionArgs (pause-time stamp)', () => {
  const question = { question: 'Which env?' };
  it('stamps args on the newest empty ask part, pure', () => {
    const content = [
      { type: 'tool_call', tool_call: { id: 'tc1', name: 'ask_user_question', args: '' } },
    ];
    const next = attachAskUserQuestionArgs(content as never, question as never);
    expect(next).not.toBe(content);
    expect(JSON.parse((next[0] as { tool_call: { args: string } }).tool_call.args)).toEqual(
      question,
    );
    expect((content[0] as { tool_call: { args: string } }).tool_call.args).toBe('');
  });
  it('skips parts that already have args or an output', () => {
    const withArgs = [
      { type: 'tool_call', tool_call: { name: 'ask_user_question', args: '{"question":"x"}' } },
    ];
    expect(attachAskUserQuestionArgs(withArgs as never, question as never)).toBe(withArgs);
    const answered = [
      { type: 'tool_call', tool_call: { name: 'ask_user_question', args: '', output: 'done' } },
    ];
    expect(attachAskUserQuestionArgs(answered as never, question as never)).toBe(answered);
  });
});
