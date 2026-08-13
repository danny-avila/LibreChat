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
      activity_end_index: 2,
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

  it('keeps interleaved parallel text context keyed to its run step', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Compared both parallel findings' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_MESSAGE_DELTA]: { handle: jest.fn() },
    });
    const emitTextStep = (id: string, agentId: string) =>
      handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id,
          agentId,
          groupId: agentId,
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'text' },
          },
        },
        undefined,
        undefined,
      );
    const emitTextDelta = (id: string, text: string) =>
      handlers?.[GraphEvents.ON_MESSAGE_DELTA]?.handle(
        GraphEvents.ON_MESSAGE_DELTA,
        { id, delta: { content: { type: ContentTypes.TEXT, text } } },
        undefined,
        undefined,
      );

    emitTextStep('lane-a', 'agent-a');
    emitTextStep('lane-b', 'agent-b');
    emitTextDelta('lane-a', 'First lane ');
    emitTextDelta('lane-b', 'Second lane');
    emitTextDelta('lane-a', 'completed');
    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'root-final',
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
      expect.objectContaining({ assistantContext: ['First lane completed', 'Second lane'] }),
    );
  });

  it('reanchors a tool that lands after the phase hook observes its child label', async () => {
    const parts: LooseContentPart[] = [];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Verified both delayed tool results' })),
    });

    /** The child-label hook can synchronously reserve its slot before the
     *  tool event reaches the shared content array. A tool-only provider turn
     *  can also leave an empty final-answer part between the tool and label;
     *  that invisible boundary must not strand the tool outside the phase. */
    parts[1] = { type: ContentTypes.TEXT, text: '', phase: 'final_answer' };
    parts[2] = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Recorded the first delayed result',
      tool_call_ids: ['tool-1'],
      pending: false,
    };
    await wiring.hook(batch('tool-1'), new AbortController().signal);

    parts[3] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } };
    parts[4] = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Recorded the second delayed result',
      tool_call_ids: ['tool-2'],
      pending: false,
    };
    await wiring.hook(batch('tool-2'), new AbortController().signal);

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

    expect(parts[5]).toMatchObject({
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_count: 2,
    });
    parts[0] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } };
    expect(parts.slice(0, 5)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool_call: { id: 'tool-1' } }),
        expect.objectContaining({ tool_call: { id: 'tool-2' } }),
      ]),
    );
  });

  it('does not claim a visible final answer for a later parent phase', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TEXT, text: 'Earlier final answer', phase: 'final_answer' },
    ];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Verified the later tool results' })),
    });

    parts[2] = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Recorded the first later result',
      tool_call_ids: ['tool-1'],
      pending: false,
    };
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts[3] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } };
    await wiring.hook(batch('tool-2'), new AbortController().signal);

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

    expect(parts[4]).toMatchObject({
      activity_label_type: 'phase',
      activity_start_index: 1,
      activity_count: 2,
    });
    parts[1] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } };
    expect(parts.slice(1, 4)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool_call: { id: 'tool-1' } }),
        expect.objectContaining({ tool_call: { id: 'tool-2' } }),
      ]),
    );
  });

  it('does not use repeated reasoning to reanchor a missing tool across a phase', async () => {
    const repeatedReasoning = 'Compared the same deployment paths.';
    const parts: LooseContentPart[] = [
      { type: ContentTypes.THINK, think: repeatedReasoning },
      {
        type: ContentTypes.ACTIVITY_LABEL,
        activity_label: '',
        activity_label_type: 'phase',
        activity_start_index: 0,
        activity_count: 2,
        pending: false,
      },
    ];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => {
        if (stepId === 'missing-tool-reasoning') return 2;
        if (stepId === 'current-reasoning') return 4;
        return undefined;
      },
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Verified the current deployment path' })),
    });
    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_REASONING_DELTA]: { handle: jest.fn() },
    });

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'missing-tool-reasoning',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'think' },
        },
      },
      undefined,
      undefined,
    );
    parts[2] = { type: ContentTypes.THINK, think: repeatedReasoning };
    handlers?.[GraphEvents.ON_REASONING_DELTA]?.handle(
      GraphEvents.ON_REASONING_DELTA,
      {
        id: 'missing-tool-reasoning',
        delta: { content: { type: ContentTypes.THINK, think: repeatedReasoning } },
      },
      undefined,
      undefined,
    );
    parts[3] = {
      type: ContentTypes.ACTIVITY_LABEL,
      activity_label: 'Recorded a result before its tool arrived',
      tool_call_ids: ['missing-tool'],
      pending: false,
    };
    await wiring.hook(batch('missing-tool'), new AbortController().signal);

    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'current-reasoning',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'think' },
        },
      },
      undefined,
      undefined,
    );
    parts[4] = { type: ContentTypes.THINK, think: repeatedReasoning };
    handlers?.[GraphEvents.ON_REASONING_DELTA]?.handle(
      GraphEvents.ON_REASONING_DELTA,
      {
        id: 'current-reasoning',
        delta: { content: { type: ContentTypes.THINK, think: repeatedReasoning } },
      },
      undefined,
      undefined,
    );

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

    expect(parts[5]).toMatchObject({
      activity_label_type: 'phase',
      activity_start_index: 2,
      activity_count: 2,
    });
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

  it('drops a stale pending-reasoning index after HITL content compaction', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'The resumed answer is complete.' },
    ];
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 2,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: [
          { startIndex: 0, status: 'success', toolCallIds: ['tool-1'] },
          { startIndex: 1, status: 'success', toolCallIds: ['tool-2'] },
        ],
        assistantContext: [],
        pendingReasoning: [
          {
            key: 'root',
            text: 'Reasoning removed by hide_sequential_outputs.',
            startIndex: 20,
          },
        ],
      },
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the resumed workflow' })),
    });

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 2, activity_count: 3 });
  });

  it('resolves index-less pending reasoning before preserving the final-text boundary', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'This answer preceded more reasoning.' },
    ];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the extended investigation' })),
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    const handlers = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      [GraphEvents.ON_REASONING_DELTA]: { handle: jest.fn() },
    });
    handlers?.[GraphEvents.ON_RUN_STEP]?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'late-reasoning',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'think' },
        },
      },
      undefined,
      undefined,
    );
    parts[3] = { type: ContentTypes.THINK, think: 'Verified one more edge case.' };
    handlers?.[GraphEvents.ON_REASONING_DELTA]?.handle(
      GraphEvents.ON_REASONING_DELTA,
      {
        id: 'late-reasoning',
        delta: {
          content: { type: ContentTypes.THINK, think: 'Verified one more edge case.' },
        },
      },
      undefined,
      undefined,
    );

    wiring.complete();
    await flushDetached();

    expect(parts[4]).toMatchObject({ activity_end_index: 4, activity_count: 3 });
  });

  it('keeps a partially materialized retained batch after the candidate final text', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'batch-a' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'This answer preceded the delayed batch tool.' },
    ];
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 2,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: [
          {
            startIndex: 20,
            status: 'success',
            toolCallIds: ['batch-a', 'batch-b'],
          },
          { startIndex: 1, status: 'success', toolCallIds: ['tool-2'] },
        ],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the delayed batch workflow' })),
    });

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 3, activity_count: 2 });
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
    expect(snapshot.overflowActivityStartIndex).toBe(19);
    expect(snapshot.overflowToolCallIds).toHaveLength(7);
  });

  it('retains every overflow tool ID tied at the latest boundary', async () => {
    const parts: LooseContentPart[] = [];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({})),
    });
    for (let index = 0; index < 13; index += 1) {
      await wiring.hook(batch(`retained-${index}`), new AbortController().signal);
    }
    await wiring.hook(batch('overflow-a'), new AbortController().signal);
    await wiring.hook(batch('overflow-b'), new AbortController().signal);

    expect(wiring.snapshot()).toMatchObject({
      overflowActivityStartIndex: 0,
      overflowToolCallIds: ['overflow-a', 'overflow-b'],
    });
  });

  it('rebases a resumed overflow anchor after content compaction', async () => {
    const parts: LooseContentPart[] = Array.from({ length: 13 }, (_, index) => ({
      type: ContentTypes.TOOL_CALL,
      tool_call: { id: `retained-${index}` },
    }));
    parts.push(
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'overflow-tool' } },
      { type: ContentTypes.TEXT, text: 'The compacted answer is complete.' },
    );
    const generatePhase = jest.fn(async () => ({ label: 'Completed the resumed workflow' }));
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 14,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: Array.from({ length: 13 }, (_, index) => ({
          startIndex: index,
          status: 'success' as const,
          toolCallIds: [`retained-${index}`],
        })),
        overflowActivityStartIndex: 30,
        overflowToolCallIds: ['overflow-tool'],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 14 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[15]).toMatchObject({ activity_end_index: 14, activity_count: 14 });
  });

  it('drops a stale reasoning-only overflow anchor after HITL compaction', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TEXT, text: 'The compacted answer is complete.' },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the resumed workflow' }));
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 14,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: Array.from({ length: 13 }, (_, index) => ({
          startIndex: 0,
          status: 'success' as const,
          thinkingExcerpts: [`Retained reasoning ${index} that was filtered on pause.`],
        })),
        overflowActivityStartIndex: 30,
        overflowReasoningExcerpt: 'Overflow reasoning that was filtered on pause.',
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 0 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[1]).toMatchObject({ activity_end_index: 0, activity_count: 14 });
  });

  it('rejects a text boundary when a duplicate reasoning anchor follows it', async () => {
    const duplicate = 'The same reasoning prefix identifies both retained activities.';
    const parts: LooseContentPart[] = [
      { type: ContentTypes.THINK, think: duplicate },
      { type: ContentTypes.TEXT, text: 'This looked like the final answer.' },
      { type: ContentTypes.THINK, think: `${duplicate} Later activity details.` },
    ];
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 2,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: [
          { startIndex: 0, status: 'success', thinkingExcerpts: [duplicate] },
          { startIndex: 2, status: 'success', thinkingExcerpts: [duplicate] },
        ],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 1 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed both reasoning passes' })),
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 3, activity_count: 2 });
  });

  it('rejects a text boundary when a duplicate overflow reasoning anchor follows it', async () => {
    const duplicate = 'The overflow reasoning prefix is shared by both positions.';
    const parts: LooseContentPart[] = [
      { type: ContentTypes.THINK, think: duplicate },
      { type: ContentTypes.TEXT, text: 'This looked like the final overflow answer.' },
      { type: ContentTypes.THINK, think: `${duplicate} Later overflow details.` },
    ];
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 14,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: Array.from({ length: 13 }, () => ({
          startIndex: 0,
          status: 'success' as const,
        })),
        overflowActivityStartIndex: 2,
        overflowReasoningExcerpt: duplicate,
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 1 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed overflow reasoning' })),
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 3, activity_count: 14 });
  });

  it('checks every overflow reasoning anchor when delayed parts materialize out of order', async () => {
    const earlier = 'The earlier overflow activity finished after the apparent answer.';
    const later = 'The later overflow activity materialized before the apparent answer.';
    const parts: LooseContentPart[] = [
      { type: ContentTypes.THINK, think: later },
      { type: ContentTypes.TEXT, text: 'This looked like the final overflow answer.' },
      { type: ContentTypes.THINK, think: earlier },
    ];
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 15,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: Array.from({ length: 13 }, () => ({
          startIndex: 0,
          status: 'success' as const,
        })),
        overflowActivityStartIndex: 2,
        overflowReasoningAnchors: [earlier, later],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 1 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed overflow reasoning' })),
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 3, activity_count: 15 });
  });

  it('retains an earlier overflow ID when delayed tools materialize in reverse order', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'overflow-b' } },
      { type: ContentTypes.TEXT, text: 'This answer arrived between delayed tools.' },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'overflow-a' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the delayed workflow' }));
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 15,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: Array.from({ length: 13 }, () => ({
          startIndex: 0,
          status: 'success' as const,
        })),
        overflowActivityStartIndex: 20,
        overflowToolCallIds: ['overflow-a', 'overflow-b'],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 1 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 3, activity_count: 15 });
  });

  it('keeps the overflow fallback while a boundary tool remains unresolved', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'overflow-a' } },
      { type: ContentTypes.TEXT, text: 'This answer preceded a delayed overflow tool.' },
    ];
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 15,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: Array.from({ length: 13 }, () => ({
          startIndex: 0,
          status: 'success' as const,
        })),
        overflowActivityStartIndex: 20,
        overflowToolCallIds: ['overflow-a', 'overflow-b'],
        overflowBoundaryToolCallIds: ['overflow-a', 'overflow-b'],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 1 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the delayed workflow' })),
    });
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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

    wiring.complete();
    await flushDetached();

    expect(parts[2]).toMatchObject({ activity_end_index: 2, activity_count: 15 });
  });

  it('extends a sparse phase start using only defined boundary slots', async () => {
    const parts: LooseContentPart[] = [];
    parts[999_998] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-a' } };
    parts[1_000_000] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-b' } };
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 2,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: [
          { startIndex: 999_998, status: 'success', toolCallIds: ['tool-a'] },
          { startIndex: 1_000_000, status: 'success', toolCallIds: ['tool-b'] },
        ],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the sparse workflow' })),
    });

    wiring.complete();
    await flushDetached();

    expect(parts[1_000_001]).toMatchObject({ activity_start_index: 0, activity_count: 2 });
  });

  it('keeps post-cap activities grouped after the last root text', async () => {
    const parts: LooseContentPart[] = [];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the extended investigation' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 13 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    for (let index = 0; index < 13; index += 1) {
      const id = `tool-${index}`;
      parts.push({ type: ContentTypes.TOOL_CALL, tool_call: { id } });
      await wiring.hook(batch(id), new AbortController().signal);
    }
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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
    parts[13] = { type: ContentTypes.TEXT, text: 'This may be the final answer.' };
    parts[14] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-overflow' } };
    await wiring.hook(batch('tool-overflow'), new AbortController().signal);

    wiring.complete();
    await flushDetached();

    expect(generatePhase).toHaveBeenCalledTimes(1);
    expect(parts[15]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 15,
      activity_count: 14,
    });
  });

  it('finds an unphased final content part without a retained run-step boundary', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'The persisted answer is complete.' },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the persisted workflow' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
  });

  it('excludes the persisted final text from the phase summary context', async () => {
    const finalText = 'The persisted answer is complete.';
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: finalText },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the persisted workflow' }));
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 2,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: [
          { startIndex: 0, status: 'success', toolCallIds: ['tool-1'] },
          { startIndex: 1, status: 'success', toolCallIds: ['tool-2'] },
        ],
        assistantContext: ['I will inspect both sources.', finalText],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });

    wiring.complete();
    await flushDetached();

    expect(generatePhase).toHaveBeenCalledWith(
      expect.objectContaining({ assistantContext: ['I will inspect both sources.'] }),
    );
    expect(parts[3]).toMatchObject({ activity_end_index: 2, activity_count: 2 });
  });

  it('prefers the materialized final text over a stale retained step index', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the indexed workflow' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 3 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    wiring
      .handlers({
        [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
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
    parts[2] = { type: ContentTypes.TEXT, text: 'The indexed answer is complete.' };

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
  });

  it('leaves the last materialized text outside even when it retains a lane id', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      {
        type: ContentTypes.TEXT,
        text: 'The lane answer is complete.',
        phase: 'final_answer',
        groupId: 'lane-a',
      },
    ];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the lane workflow' })),
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({ activity_end_index: 2, activity_count: 2 });
  });

  it('skips a trailing empty text reservation when choosing the final boundary', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'The materialized answer is complete.' },
      { type: ContentTypes.TEXT, text: '', phase: 'final_answer' },
    ];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'empty-final' ? 3 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the workflow' })),
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    wiring
      .handlers({ [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id: 'empty-final',
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'text' },
          },
        },
        undefined,
        undefined,
      );

    wiring.complete();
    await flushDetached();

    expect(parts[4]).toMatchObject({ activity_end_index: 2, activity_count: 2 });
  });

  it('ignores an empty reasoning reservation after the materialized final text', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'The answer is complete.' },
      { type: ContentTypes.THINK, think: '' },
    ];
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'empty-reasoning' ? 3 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase: jest.fn(async () => ({ label: 'Completed the workflow' })),
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    wiring
      .handlers({
        [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
      })
      ?.[GraphEvents.ON_RUN_STEP]?.handle(
        GraphEvents.ON_RUN_STEP,
        {
          id: 'empty-reasoning',
          stepDetails: {
            type: StepTypes.MESSAGE_CREATION,
            message_creation: { message_id: 'm', content_type: 'think' },
          },
        },
        undefined,
        undefined,
      );

    wiring.complete();
    await flushDetached();

    expect(parts[4]).toMatchObject({ activity_end_index: 2, activity_count: 2 });
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
    expect(generatePhase).not.toHaveBeenCalled();

    parts[2] = { type: ContentTypes.TEXT, text: 'Finished the run' };
    wiring.complete();
    await flushDetached();
    expect(generatePhase).toHaveBeenCalledTimes(1);
    expect(parts[3]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
  });

  it('leaves final semantic commentary outside a completion-finalized phase', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the commentary phase' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-commentary' ? 2 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts[1] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } };
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];
    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'root-commentary',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text', phase: 'commentary' },
        },
      },
      undefined,
      undefined,
    );
    parts[2] = { type: ContentTypes.TEXT, text: 'Intermediate commentary', phase: 'commentary' };

    wiring.complete();
    await flushDetached();

    expect(parts[3]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 2,
      activity_count: 2,
    });
  });

  it('leaves the last semantic commentary outside after earlier unphased text', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
    ];
    const stepIndexes = new Map([
      ['root-text', 1],
      ['commentary', 3],
    ]);
    const generatePhase = jest.fn(async () => ({ label: 'Completed the commentary phase' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => stepIndexes.get(stepId),
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
        id: 'root-text',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text' },
        },
      },
      undefined,
      undefined,
    );
    parts[1] = { type: ContentTypes.TEXT, text: 'I will keep investigating.' };
    parts[2] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } };
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'commentary',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text', phase: 'commentary' },
        },
      },
      undefined,
      undefined,
    );
    parts[3] = {
      type: ContentTypes.TEXT,
      text: 'The second search confirmed it.',
      phase: 'commentary',
    };

    wiring.complete();
    await flushDetached();

    expect(parts[4]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 3,
      activity_count: 2,
    });
  });

  it('leaves persisted final commentary outside the phase after HITL resume', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TEXT, text: 'I will keep investigating.' },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } },
      { type: ContentTypes.TEXT, text: 'The second search confirmed it.', phase: 'commentary' },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the resumed commentary' }));
    const wiring = createActivityPhaseWiring({
      initialSnapshot: {
        version: 1,
        generated: 0,
        activityCount: 2,
        failedActivityCount: 0,
        partialActivityCount: 0,
        agentIds: [],
        activities: [
          { startIndex: 0, status: 'success', toolCallIds: ['tool-1'] },
          { startIndex: 2, status: 'success', toolCallIds: ['tool-2'] },
        ],
        assistantContext: [],
        pendingReasoning: [],
      },
      getContentParts: () => parts,
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });

    wiring.complete();
    await flushDetached();

    expect(parts[4]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 3,
      activity_count: 2,
    });
  });

  it('summarizes all unphased activities once at root-run completion', async () => {
    const parts: LooseContentPart[] = [];
    const stepIndexes = new Map([
      ['intermediate-text', 2],
      ['final-text', 5],
    ]);
    const generatePhase = jest.fn(async () => ({ label: 'Completed the full investigation' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => stepIndexes.get(stepId),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];

    parts[0] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } };
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts[1] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } };
    await wiring.hook(batch('tool-2'), new AbortController().signal);
    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'intermediate-text',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text' },
        },
      },
      undefined,
      undefined,
    );
    parts[2] = { type: ContentTypes.TEXT, text: 'I will try another approach.' };

    parts[3] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-3' } };
    await wiring.hook(batch('tool-3'), new AbortController().signal);
    parts[4] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-4' } };
    await wiring.hook(batch('tool-4'), new AbortController().signal);
    handler?.handle(
      GraphEvents.ON_RUN_STEP,
      {
        id: 'final-text',
        stepDetails: {
          type: StepTypes.MESSAGE_CREATION,
          message_creation: { message_id: 'm', content_type: 'text' },
        },
      },
      undefined,
      undefined,
    );
    parts[5] = { type: ContentTypes.TEXT, text: 'The investigation is complete.' };
    parts[6] = {
      type: ContentTypes.ACTIVITY_LABEL,
      [ContentTypes.ACTIVITY_LABEL]: 'Recorded the delayed child result',
      tool_call_ids: ['tool-4'],
      pending: false,
    };

    expect(generatePhase).not.toHaveBeenCalled();
    wiring.complete();
    await flushDetached();

    expect(generatePhase).toHaveBeenCalledTimes(1);
    expect(generatePhase).toHaveBeenCalledWith(expect.objectContaining({ totalActivityCount: 4 }));
    expect(parts[7]).toMatchObject({
      activity_label_type: 'phase',
      activity_start_index: 0,
      activity_end_index: 5,
      activity_count: 4,
    });
  });

  it('keeps later activities grouped when the last root text preceded them', async () => {
    const parts: LooseContentPart[] = [{ type: ContentTypes.TEXT, text: 'I will investigate.' }];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the direct-return workflow' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 0 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];
    handler?.handle(
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
    parts[1] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } };
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    parts[2] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-2' } };
    await wiring.hook(batch('tool-2'), new AbortController().signal);

    wiring.complete();
    await flushDetached();

    expect(generatePhase).toHaveBeenCalledTimes(1);
    expect(parts[3]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 3,
      activity_count: 2,
    });
  });

  it('keeps a parallel tool batch grouped when it straddles the last root text', async () => {
    const parts: LooseContentPart[] = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'tool-1' } },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'parallel-1' } },
    ];
    const generatePhase = jest.fn(async () => ({ label: 'Completed the parallel workflow' }));
    const wiring = createActivityPhaseWiring({
      getContentParts: () => parts,
      getStepIndex: (stepId) => (stepId === 'root-text' ? 2 : undefined),
      bumpIndexOffset: jest.fn(),
      emitLabelEvent: jest.fn(async () => undefined),
      trackPendingFill: jest.fn(),
      generatePhase,
    });
    await wiring.hook(batch('tool-1'), new AbortController().signal);
    const parallelBatch = batch('parallel-1');
    parallelBatch.entries.push({
      ...parallelBatch.entries[0],
      toolUseId: 'parallel-2',
      toolInput: { query: 'parallel-2' },
      toolOutput: 'parallel-2-result',
    });
    await wiring.hook(parallelBatch, new AbortController().signal);
    const handler = wiring.handlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() },
    })?.[GraphEvents.ON_RUN_STEP];
    handler?.handle(
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
    parts[2] = { type: ContentTypes.TEXT, text: 'The parallel work may be complete.' };
    parts[3] = { type: ContentTypes.TOOL_CALL, tool_call: { id: 'parallel-2' } };

    wiring.complete();
    await flushDetached();

    expect(generatePhase).toHaveBeenCalledTimes(1);
    expect(parts[4]).toMatchObject({
      activity_start_index: 0,
      activity_end_index: 4,
      activity_count: 2,
    });
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
