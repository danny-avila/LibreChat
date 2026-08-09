import { GraphEvents } from '@librechat/agents';
import { ContentTypes, StepTypes } from 'librechat-data-provider';
import type { EventHandler, PostToolBatchHookInput } from '@librechat/agents';
import type { LooseContentPart } from '~/agents/activityLabels/wiring';
import { createActivityPhaseWiring, createAssistantPhaseStampingHandlers } from './runtime';

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
        handle: (_event, data) => forwarded.push(data),
      } as EventHandler,
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
        activities: expect.any(Array),
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
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } as EventHandler,
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
});

describe('createAssistantPhaseStampingHandlers', () => {
  it('stamps commentary onto persisted text deltas for child activity-label intent', () => {
    const received: unknown[] = [];
    const handlers = createAssistantPhaseStampingHandlers({
      [GraphEvents.ON_RUN_STEP]: { handle: jest.fn() } as EventHandler,
      [GraphEvents.ON_MESSAGE_DELTA]: {
        handle: (_event, data) => received.push(data),
      } as EventHandler,
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
