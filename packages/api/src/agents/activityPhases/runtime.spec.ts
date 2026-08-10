import { GraphEvents } from '@librechat/agents';
import { ContentTypes, StepTypes } from 'librechat-data-provider';
import type { PostToolBatchHookInput } from '@librechat/agents';
import type { LooseContentPart } from '~/agents/activityLabels/wiring';
import type { GenerateActivityPhasePayload } from './runtime';
import {
  ACTIVITY_PHASE_INSTRUCTION,
  createActivityPhaseWiring,
  createAssistantPhaseStampingHandlers,
} from './runtime';

const batch = (id: string): PostToolBatchHookInput =>
  ({
    hook_event_name: 'PostToolBatch',
    runId: 'run-1',
    entries: [
      {
        toolName: 'web_search',
        toolInput: { query: id },
        toolUseId: id,
        status: 'success',
        toolOutput: `${id}-result`,
      },
    ],
  }) as PostToolBatchHookInput;

async function flushDetached(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('createActivityPhaseWiring', () => {
  it('claims one parent phase before forwarding the final text step', async () => {
    const parts: LooseContentPart[] = [];
    const forwarded: unknown[] = [];
    const emitLabelEvent = jest.fn(async () => undefined);
    const generatePhase = jest.fn(async () => ({ label: 'Resolved the release compatibility' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent,
      trackPendingFill: jest.fn(),
      generatePhase,
    });

    parts.push({
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: 'tool-1' },
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts.push({
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: 'tool-2' },
    });
    await wiring.hook(batch('tool-2'), new AbortController().signal);

    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: {
        handle: (_event, data) => {
          forwarded.push(data);
        },
      },
    });
    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'final-step',
        index: 2,
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: {
            message_id: 'message-1',
            content_type: 'text',
            phase: 'final_answer',
          },
        },
      },
      undefined,
      undefined,
    );

    expect(forwarded).toHaveLength(1);
    expect(parts[2]).toMatchObject({
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_count: 2,
      pending: true,
    });
    await flushDetached();
    expect(generatePhase).toHaveBeenCalledWith(
      expect.objectContaining({
        closingTextPhase: 'final_answer',
        phaseIndex: 0,
        totalActivityCount: 2,
        activities: expect.any(Array),
        prompt: ACTIVITY_PHASE_INSTRUCTION,
      }),
    );
    expect(parts[2]).toMatchObject({
      activity_label: 'Resolved the release compatibility',
      pending: false,
    });
    expect(emitLabelEvent).toHaveBeenCalledTimes(2);
  });

  it('does not spend a phase call on one logical activity', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'unused' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];
    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'final-step',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
        },
      },
      undefined,
      undefined,
    );
    await flushDetached();
    expect(generatePhase).not.toHaveBeenCalled();
    expect(parts).toHaveLength(1);
  });

  it('keeps reasoning attached to a tool batch across commentary', async () => {
    const parts: LooseContentPart[] = [];
    const generatePhase = jest.fn(async () => ({ label: 'unused' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_REASONING_DELTA]: { handle: jest.fn() },
    });

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'reasoning-step',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'think' },
        },
      },
      undefined,
      undefined,
    );
    handlers?.[GraphEvents.ON_REASONING_DELTA]?.handle(
      GraphEvents.ON_REASONING_DELTA,
      {
        id: 'reasoning-step',
        delta: { content: { type: ContentTypes.THINK, think: 'Compared both auth paths.' } },
      },
      undefined,
      undefined,
    );
    parts.push({ type: ContentTypes.THINK, think: 'Compared both auth paths.' });
    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'commentary-step',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text', phase: 'commentary' },
        },
      },
      undefined,
      undefined,
    );

    expect(wiring.snapshot()).toMatchObject({
      activityCount: 0,
      pendingReasoning: [{ key: 'root', text: 'Compared both auth paths.' }],
    });

    parts.push({ type: ContentTypes.TEXT, text: 'I will verify the middleware.' });
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    expect(wiring.snapshot()).toMatchObject({
      activityCount: 1,
      activities: [expect.objectContaining({ thinkingExcerpts: ['Compared both auth paths.'] })],
      pendingReasoning: [],
    });

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'final-step',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
        },
      },
      undefined,
      undefined,
    );
    await flushDetached();
    expect(generatePhase).not.toHaveBeenCalled();
    expect(parts.some((part) => part.activity_label_type === 'phase')).toBe(false);
  });

  it('counts a top-level handoff as a logical phase activity', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'handoff-1' } },
    ];
    let generatedActivities: GenerateActivityPhasePayload['activities'] | undefined;
    const generatePhase = jest.fn(async (payload: GenerateActivityPhasePayload) => {
      generatedActivities = payload.activities;
      return { label: 'Transferred ownership and verified the account state' };
    });
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    const handoff = batch('handoff-1');
    handoff.entries[0].toolName = 'lc_transfer_to_billing_agent';
    await wiring.hook(handoff, new AbortController().signal);
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } });
    await wiring.hook(batch('tool-1'), new AbortController().signal);

    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id: 'final-step',
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
          },
        },
        undefined,
        undefined,
      );

    await flushDetached();
    expect(generatePhase).toHaveBeenCalledTimes(1);
    expect(generatedActivities).toHaveLength(2);
    expect(generatedActivities?.[0]?.entries?.[0]?.toolName).toBe('lc_transfer_to_billing_agent');
  });

  it('keeps reasoning attached to an unphased parallel tool batch', async () => {
    const parts: LooseContentPart[] = [];
    const generatePhase = jest.fn(async () => ({ label: 'unused' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_REASONING_DELTA]: { handle: jest.fn() },
    });

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'lane-reasoning',
        agentId: 'agent-a',
        groupId: 'lane-a',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'think' },
        },
      },
      undefined,
      undefined,
    );
    handlers?.[GraphEvents.ON_REASONING_DELTA]?.handle(
      GraphEvents.ON_REASONING_DELTA,
      {
        id: 'lane-reasoning',
        delta: { content: { type: ContentTypes.THINK, think: 'Checked the lane input.' } },
      },
      undefined,
      undefined,
    );
    parts.push({ type: ContentTypes.THINK, think: 'Checked the lane input.' });
    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'lane-text',
        agentId: 'agent-a',
        groupId: 'lane-a',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text' },
        },
      },
      undefined,
      undefined,
    );

    expect(wiring.snapshot()).toMatchObject({
      activityCount: 0,
      pendingReasoning: [{ key: 'agent-a', text: 'Checked the lane input.' }],
    });

    parts.push({ type: ContentTypes.TEXT, text: 'I will inspect the tool result.' });
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } });
    await wiring.hook(
      { ...batch('tool-1'), executingAgentId: 'agent-a' },
      new AbortController().signal,
    );
    expect(wiring.snapshot()).toMatchObject({
      activityCount: 1,
      activities: [expect.objectContaining({ thinkingExcerpts: ['Checked the lane input.'] })],
      pendingReasoning: [],
    });

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'root-text',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text' },
        },
      },
      undefined,
      undefined,
    );
    await flushDetached();
    expect(generatePhase).not.toHaveBeenCalled();
    expect(parts.some((part) => part.activity_label_type === 'phase')).toBe(false);
  });

  it('anchors parallel standalone reasoning to each lane content part', async () => {
    const parts: LooseContentPart[] = [];
    const stepIndexes = new Map([
      ['reasoning-a', 0],
      ['reasoning-b', 1],
    ]);
    let generatedActivities: GenerateActivityPhasePayload['activities'] | undefined;
    const generatePhase = jest.fn(async (payload: GenerateActivityPhasePayload) => {
      generatedActivities = payload.activities;
      return { label: 'Reconciled both agent analyses' };
    });
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => stepIndexes.get(stepId),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_REASONING_DELTA]: { handle: jest.fn() },
    });
    const emitReasoning = (id: string, agentId: string, index: number, text: string) => {
      handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id,
          index,
          agentId,
          groupId: agentId,
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'think' },
          },
        },
        undefined,
        undefined,
      );
      parts[index] = { type: ContentTypes.THINK, think: text, agentId, groupId: index + 1 };
      handlers?.[GraphEvents.ON_REASONING_DELTA]?.handle(
        GraphEvents.ON_REASONING_DELTA,
        {
          id,
          delta: { content: { type: ContentTypes.THINK, think: text } },
        },
        undefined,
        undefined,
      );
    };
    emitReasoning('reasoning-a', 'agent-a', 0, 'Checked the first path.');
    emitReasoning('reasoning-b', 'agent-b', 1, 'Checked the second path.');

    expect(wiring.snapshot().pendingReasoning).toEqual([
      expect.objectContaining({ key: 'agent-a', startIndex: 0 }),
      expect.objectContaining({ key: 'agent-b', startIndex: 1 }),
    ]);

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'root-final',
        index: 2,
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
        },
      },
      undefined,
      undefined,
    );

    await flushDetached();
    expect(generatePhase).toHaveBeenCalledWith(
      expect.objectContaining({ activities: expect.arrayContaining([expect.any(Object)]) }),
    );
    expect(generatedActivities).toHaveLength(2);
    expect(parts[2]).toMatchObject({ activity_start_index: 0, activity_count: 2 });
  });

  it('restores bounded activity state after a HITL pause', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TEXT, text: 'Hidden intermediate output' },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const first = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({})),
    });
    await first.hook(batch('tool-1'), new AbortController().signal);
    /** `hide_sequential_outputs` reshapes the persisted prefix after the pause
     *  snapshot, so restoration must re-anchor by tool id rather than index. */
    parts.shift();

    let generatedActivities: GenerateActivityPhasePayload['activities'] | undefined;
    const generatePhase = jest.fn(async (payload: GenerateActivityPhasePayload) => {
      generatedActivities = payload.activities;
      return { label: 'Completed the resumed investigation' };
    });
    const resumed = createActivityPhaseWiring({
      initialSnapshot: first.snapshot(),
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } });
    await resumed.hook(batch('tool-2'), new AbortController().signal);
    resumed
      .handlers({
        [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id: 'final-step',
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
          },
        },
        undefined,
        undefined,
      );

    await flushDetached();
    expect(generatePhase).toHaveBeenCalledWith(
      expect.objectContaining({ activities: expect.arrayContaining([expect.any(Object)]) }),
    );
    expect(generatedActivities).toHaveLength(2);
    expect(parts[parts.length - 1]).toMatchObject({ activity_start_index: 0 });
  });

  it('bounds persisted evidence while preserving the full activity count', async () => {
    const parts: LooseContentPart[] = [];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({})),
    });
    for (let index = 0; index < 20; index += 1) {
      const id = `tool-${index}`;
      parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id } });
      await wiring.hook(batch(id), new AbortController().signal);
    }

    const snapshot = wiring.snapshot();
    expect(snapshot.activityCount).toBe(20);
    expect(snapshot.activities).toHaveLength(13);
  });

  it('keeps a parallel lane final inside the run-wide phase', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Combined both agent outcomes' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } });
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];
    const finalStep = {
      id: 'lane-final',
      groupId: 'lane-a',
      stepDetails: {
        type: StepTypes.MESSAGE_CREATION,
        message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
      },
    };
    handler?.handle(GraphEvents.ON_RUN_STEP, finalStep, undefined, undefined);
    await flushDetached();
    expect(generatePhase).not.toHaveBeenCalled();

    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      { ...finalStep, id: 'root-final', groupId: undefined },
      undefined,
      undefined,
    );
    await flushDetached();
    expect(generatePhase).toHaveBeenCalledTimes(1);
  });

  it('keeps unphased parallel text inside the run-wide fallback phase', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Combined both agent outcomes' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } });
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];
    const textStep = {
      id: 'lane-text',
      groupId: 'lane-a',
      stepDetails: {
        type: StepTypes.MESSAGE_CREATION,
        message_creation: { message_id: 'm', content_type: 'text' },
      },
    };
    handler?.handle(GraphEvents.ON_RUN_STEP, textStep, undefined, undefined);
    await flushDetached();
    expect(generatePhase).not.toHaveBeenCalled();

    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      { ...textStep, id: 'root-text', groupId: undefined },
      undefined,
      undefined,
    );
    await flushDetached();
    expect(generatePhase).toHaveBeenCalledTimes(1);
  });

  it('preserves mixed batch failures as a partial phase outcome', async () => {
    const mixed = batch('tool-1');
    mixed.entries.push({
      toolName: 'web_search',
      toolInput: { query: 'failed' },
      toolUseId: 'tool-1b',
      status: 'error',
      error: 'unavailable',
    });
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1b' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Recovered part of the search scope' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(mixed, new AbortController().signal);
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } });
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    wiring
      .handlers({
        [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id: 'final-step',
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
          },
        },
        undefined,
        undefined,
      );

    await flushDetached();
    expect(generatePhase).toHaveBeenCalledWith(expect.objectContaining({ status: 'partial' }));
    expect(parts[parts.length - 1]).toMatchObject({ status: 'partial' });
  });

  it('collects usage after a committed blank phase result', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const collectUsage = jest.fn(async () => undefined);
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ collectUsage })),
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } });
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    wiring
      .handlers({
        [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id: 'final-step',
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'text', phase: 'final_answer' },
          },
        },
        undefined,
        undefined,
      );

    await flushDetached();
    expect(collectUsage).toHaveBeenCalledWith(undefined);
    expect(parts[parts.length - 1]).toMatchObject({ activity_label: '', pending: false });
  });
});

describe('createAssistantPhaseStampingHandlers', () => {
  it('stamps commentary onto persisted text deltas for child activity-label intent', () => {
    const received: unknown[] = [];
    const handlers = createAssistantPhaseStampingHandlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_MESSAGE_DELTA]: {
        handle: (_event, data) => {
          received.push(data);
        },
      },
    });
    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'commentary-step',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', phase: 'commentary' },
        },
      },
      undefined,
      undefined,
    );
    handlers?.[GraphEvents.ON_MESSAGE_DELTA]?.handle(
      GraphEvents.ON_MESSAGE_DELTA,
      {
        id: 'commentary-step',
        delta: { content: { type: ContentTypes.TEXT, text: 'I will compare both paths.' } },
      },
      undefined,
      undefined,
    );
    expect(received[0]).toMatchObject({
      delta: { content: { type: ContentTypes.TEXT, phase: 'commentary' } },
    });
  });
});
