import { StepTypes } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import type { SerializableJobData } from '~/stream';
import {
  createAgentEventTerminalHandler as createAgentEventTerminalHandlerImpl,
  createAgentEventActionRecorder,
} from './outcome';

const createAgentEventTerminalHandler = (
  methods: Pick<
    Parameters<typeof createAgentEventTerminalHandlerImpl>[0],
    'settleAgentTriggerHandlingOutcome'
  > &
    Partial<Parameters<typeof createAgentEventTerminalHandlerImpl>[0]>,
) =>
  createAgentEventTerminalHandlerImpl({
    getAgentEventActorSnapshot: jest.fn().mockResolvedValue(undefined),
    getMessage: jest.fn().mockResolvedValue(null),
    resolveAgentEventActorReconciliation: jest.fn().mockResolvedValue(true),
    clearAgentEventActorReconciliation: jest.fn().mockResolvedValue(true),
    settleAgentEventActorReceipt: jest.fn().mockResolvedValue(true),
    getAgentEventActorReceipt: jest.fn().mockResolvedValue(null),
    backfillAgentEventActorReceipt: jest.fn().mockResolvedValue(true),
    completeAgentEventActorLegacyTurn: jest.fn().mockResolvedValue(true),
    ...methods,
  });

function job(overrides: Partial<SerializableJobData> = {}): SerializableJobData {
  return {
    streamId: 'conversation-1',
    conversationId: 'conversation-1',
    userId: 'user-1',
    status: 'complete',
    createdAt: 1_787_000_000_000,
    completedAt: 1_787_000_001_000,
    syncSent: false,
    agentEventDeliveryKey: 'trigger_1',
    ...overrides,
  };
}

function completedToolStep(): Agents.RunStep {
  return {
    id: 'step-1',
    index: 0,
    type: StepTypes.TOOL_CALLS,
    status: 'completed',
    stepDetails: {
      type: StepTypes.TOOL_CALLS,
      tool_calls: [
        {
          id: 'call-1',
          name: 'submit_move_mcp_speed-chess',
          args: { gameId: 'game-1', expectedPly: 7 },
          output: '{"accepted":true}',
        },
      ],
    },
  };
}

describe('agent event terminal outcomes', () => {
  it('records applied only from completed tool evidence matching the expected fence', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });

    await handler(
      'conversation-1',
      job({
        agentEventExpectedAction: {
          toolName: 'submit_move',
          argumentSubset: { gameId: 'game-1', expectedPly: 7 },
        },
      }),
      [completedToolStep()],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: 'trigger_1',
        generationCreatedAt: 1_787_000_000_000,
        status: 'applied',
        action: { toolName: 'submit_move_mcp_speed-chess', toolCallId: 'call-1' },
      }),
    );
  });

  it('reports a clean terminal generation without matching evidence as completed_no_action', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });

    await handler(
      'conversation-1',
      job({
        agentEventExpectedAction: {
          toolName: 'submit_move',
          argumentSubset: { gameId: 'another-game' },
        },
      }),
      [completedToolStep()],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed_no_action' }),
    );
  });

  it('seals a persisted legacy turn from a non-resume terminal owner', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const completeAgentEventActorLegacyTurn = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      completeAgentEventActorLegacyTurn,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: null,
        reconciliations: [],
        legacyTurn: { token: 'legacy-terminal-token', startedAt: new Date() },
      }),
      getMessage: jest.fn().mockImplementation(({ messageId }) =>
        Promise.resolve(
          messageId.endsWith(':user')
            ? {
                messageId,
                conversationId: 'conversation-1',
                isCreatedByUser: true,
              }
            : {
                messageId,
                conversationId: 'conversation-1',
                parentMessageId: 'trigger_1:user',
                isCreatedByUser: false,
              },
        ),
      ),
    });

    await handler(
      'conversation-1',
      job({ status: 'aborted', agentEventLegacyTurnToken: 'legacy-terminal-token' }),
      [],
    );

    expect(completeAgentEventActorLegacyTurn).toHaveBeenCalledWith({
      user: 'user-1',
      conversationId: 'conversation-1',
      token: 'legacy-terminal-token',
    });
    expect(completeAgentEventActorLegacyTurn.mock.invocationCallOrder[0]).toBeLessThan(
      settleAgentTriggerHandlingOutcome.mock.invocationCallOrder[0],
    );
  });

  it('keeps a terminal legacy fence closed when required message history is missing', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const completeAgentEventActorLegacyTurn = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      completeAgentEventActorLegacyTurn,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: null,
        reconciliations: [],
        legacyTurn: { token: 'legacy-terminal-token', startedAt: new Date() },
      }),
      getMessage: jest.fn().mockResolvedValue(null),
    });

    await expect(
      handler(
        'conversation-1',
        job({ status: 'aborted', agentEventLegacyTurnToken: 'legacy-terminal-token' }),
        [],
      ),
    ).rejects.toThrow('invalid durable message history');

    expect(completeAgentEventActorLegacyTurn).not.toHaveBeenCalled();
    expect(settleAgentTriggerHandlingOutcome).not.toHaveBeenCalled();
  });

  it('replays terminal settlement after the same legacy token was already sealed', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const completeAgentEventActorLegacyTurn = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      completeAgentEventActorLegacyTurn,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: null,
        reconciliations: [],
        legacyTurn: null,
      }),
    });

    await handler(
      'conversation-1',
      job({ status: 'aborted', agentEventLegacyTurnToken: 'legacy-terminal-token' }),
      [],
    );

    expect(completeAgentEventActorLegacyTurn).not.toHaveBeenCalled();
    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledTimes(1);
  });

  it('matches nested action arrays structurally', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
    const step = completedToolStep();
    if (step.stepDetails.type !== 'tool_calls' || !step.stepDetails.tool_calls?.[0]) {
      throw new Error('Expected tool evidence');
    }
    const call = step.stepDetails.tool_calls[0];
    if ('function' in call) {
      throw new Error('Expected legacy tool evidence');
    }
    call.args = {
      gameId: 'game-1',
      moves: ['e4', { replies: ['c5', 'Nf3'] }],
    };

    await handler(
      'conversation-1',
      job({
        agentEventExpectedAction: {
          toolName: 'submit_move',
          argumentSubset: { moves: ['e4', { replies: ['c5', 'Nf3'] }] },
        },
      }),
      [step],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'applied' }),
    );
  });

  it('does not treat a background launch handle as applied work', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
    const step = completedToolStep();
    if (step.stepDetails.type !== 'tool_calls' || !step.stepDetails.tool_calls?.[0]) {
      throw new Error('Expected tool evidence');
    }
    const call = step.stepDetails.tool_calls[0];
    if ('function' in call) {
      throw new Error('Expected legacy tool evidence');
    }
    call.args = { gameId: 'game-1', expectedPly: 7, run_in_background: true };
    call.output = JSON.stringify({
      status: 'running',
      background_task_id: 'task-1',
    });

    await handler(
      'conversation-1',
      job({ agentEventExpectedAction: { toolName: 'submit_move' } }),
      [step],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed_no_action' }),
    );
  });

  it('does not treat a rejected background dispatch as applied work', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
    const step = completedToolStep();
    if (step.stepDetails.type !== 'tool_calls' || !step.stepDetails.tool_calls?.[0]) {
      throw new Error('Expected tool evidence');
    }
    const call = step.stepDetails.tool_calls[0];
    if ('function' in call) {
      throw new Error('Expected legacy tool evidence');
    }
    call.args = { gameId: 'game-1', expectedPly: 7, run_in_background: true };
    call.output = JSON.stringify({ status: 'rejected', tool: 'submit_move' });

    await handler(
      'conversation-1',
      job({ agentEventExpectedAction: { toolName: 'submit_move' } }),
      [step],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed_no_action' }),
    );
  });

  it('retains a foreground tool-authored rejected status as execution evidence', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
    const step = completedToolStep();
    if (step.stepDetails.type !== 'tool_calls' || !step.stepDetails.tool_calls?.[0]) {
      throw new Error('Expected tool evidence');
    }
    const call = step.stepDetails.tool_calls[0];
    if ('function' in call) {
      throw new Error('Expected legacy tool evidence');
    }
    call.output = JSON.stringify({ status: 'rejected' });

    await handler(
      'conversation-1',
      job({ agentEventExpectedAction: { toolName: 'submit_move' } }),
      [step],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'applied' }),
    );
  });

  it.each(['decision_response', 'decision_reason'] as const)(
    'does not treat a human-authored %s output as executed tool evidence',
    async (field) => {
      const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
      const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
      const step = completedToolStep();
      await handler(
        'conversation-1',
        job({
          agentEventExpectedAction: { toolName: 'submit_move' },
          userSubmittedMessageFieldPaths: [{ path: '/content/2/tool_call/output', field }],
        }),
        [step],
        [
          { type: 'text', text: 'before' },
          { type: 'text', text: 'approval' },
          {
            type: 'tool_call',
            tool_call: {
              id: 'call-1',
              name: 'submit_move_mcp_speed-chess',
              output: 'human supplied output',
            },
          },
        ],
      );

      expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed_no_action' }),
      );
    },
  );

  it('does not treat a function-shaped call rejected by input validation as applied', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
    const step = completedToolStep();
    if (step.stepDetails.type !== 'tool_calls') {
      throw new Error('Expected tool evidence');
    }
    step.stepDetails.tool_calls = [
      {
        id: 'call-invalid',
        type: 'function',
        function: {
          name: 'submit_move_mcp_speed-chess',
          arguments: { gameId: 'game-1', expectedPly: 7 },
          output: '{"rejected":true}',
        },
        inputValidationError: true,
      } as Agents.AgentToolCall,
    ];

    await handler(
      'conversation-1',
      job({
        agentEventExpectedAction: {
          toolName: 'submit_move',
          argumentSubset: { gameId: 'game-1', expectedPly: 7 },
        },
      }),
      [step],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed_no_action' }),
    );
  });

  it.each(['legacy', 'function'] as const)(
    'does not treat a failed %s foreground call as applied',
    async (shape) => {
      const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
      const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
      const step = completedToolStep();
      step.status = 'failed';
      if (shape === 'function') {
        if (step.stepDetails.type !== 'tool_calls') {
          throw new Error('Expected tool evidence');
        }
        step.stepDetails.tool_calls = [
          {
            id: 'call-failed',
            type: 'function',
            function: {
              name: 'submit_move_mcp_speed-chess',
              arguments: { gameId: 'game-1' },
              output: 'Error: [submit_move] tool call failed: unavailable',
            },
          } as Agents.AgentToolCall,
        ];
      } else if (step.stepDetails.type === 'tool_calls' && step.stepDetails.tool_calls?.[0]) {
        const call = step.stepDetails.tool_calls[0];
        if ('function' in call) {
          throw new Error('Expected legacy tool evidence');
        }
        call.output = 'Error: [submit_move] tool call failed: unavailable';
      }

      await handler(
        'conversation-1',
        job({ agentEventExpectedAction: { toolName: 'submit_move' } }),
        [step],
      );

      expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed_no_action' }),
      );
    },
  );

  it('preserves an applied call when a sibling makes the enclosing step fail', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });
    const step = completedToolStep();
    step.status = 'failed';
    if (step.stepDetails.type !== 'tool_calls') {
      throw new Error('Expected tool evidence');
    }
    step.stepDetails.tool_calls = [
      {
        id: 'call-applied',
        name: 'submit_move_mcp_speed-chess',
        args: { gameId: 'game-1' },
        output: '{"accepted":true}',
        executionStatus: 'success',
      } as Agents.AgentToolCall,
      {
        id: 'call-failed',
        name: 'notify_spectators',
        args: {},
        output: 'Error: [notify_spectators] tool call failed: unavailable',
        executionStatus: 'error',
      } as Agents.AgentToolCall,
    ];

    await handler(
      'conversation-1',
      job({ agentEventExpectedAction: { toolName: 'submit_move' } }),
      [step],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'applied',
        action: { toolName: 'submit_move_mcp_speed-chess', toolCallId: 'call-applied' },
      }),
    );
  });

  it('does not infer that a source action was applied without an explicit evidence contract', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });

    await handler('conversation-1', job(), [completedToolStep()]);

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed_no_action' }),
    );
    expect(settleAgentTriggerHandlingOutcome.mock.calls[0][0]).not.toHaveProperty('action');
  });

  it('preserves terminal generation failures without relying on tool evidence', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });

    await handler('conversation-1', job({ status: 'error', error: 'provider unavailable' }), []);

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'provider unavailable' }),
    );
  });

  it('keeps a verified side effect authoritative when later generation work fails', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });

    await handler(
      'conversation-1',
      job({
        status: 'error',
        error: 'follow-up model call failed',
        agentEventExpectedAction: {
          toolName: 'submit_move',
          argumentSubset: { gameId: 'game-1', expectedPly: 7 },
        },
      }),
      [completedToolStep()],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'applied' }),
    );
    expect(settleAgentTriggerHandlingOutcome.mock.calls[0][0]).not.toHaveProperty('error');
  });

  it('records cancellation when the generation stops before applying the expected action', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const handler = createAgentEventTerminalHandler({ settleAgentTriggerHandlingOutcome });

    await handler(
      'conversation-1',
      job({ status: 'aborted', agentEventExpectedAction: { toolName: 'submit_move' } }),
      [],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('defers terminal settlement until the post-commit history barrier is durable', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const getMessage = jest.fn().mockResolvedValue(null);
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: {
          generation: 1,
          checkpoint: {
            threadId: 'conversation-1',
            checkpointId: 'checkpoint-1',
            checkpointNs: 'event-actor/trigger_1',
          },
        },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'persistence_pending',
            checkpoint: {
              threadId: 'conversation-1',
              checkpointId: 'checkpoint-1',
              checkpointNs: 'event-actor/trigger_1',
            },
            action: { toolName: 'submit_move' },
            observedAt: new Date(),
          },
        ],
      }),
      getMessage,
      resolveAgentEventActorReconciliation: jest.fn().mockResolvedValue(true),
    });

    await expect(
      handler('conversation-1', job({ agentEventExpectedAction: { toolName: 'submit_move' } }), [
        completedToolStep(),
      ]),
    ).rejects.toThrow('requires persistence_pending reconciliation');
    expect(getMessage).not.toHaveBeenCalled();
    expect(settleAgentTriggerHandlingOutcome).not.toHaveBeenCalled();
  });

  it('repairs a lost actor acknowledgement from deterministic durable messages before settling', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const resolveAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            actionAdmitted: true,
            status: 'history_persisted',
            checkpoint,
            action: { toolName: 'submit_move' },
            observedAt: new Date(),
          },
        ],
      }),
      getMessage: jest.fn(async ({ messageId }) => {
        const isUser = messageId.endsWith(':user');
        return {
          messageId,
          conversationId: 'conversation-1',
          isCreatedByUser: isUser,
          parentMessageId: isUser ? 'parent-message' : 'trigger_1:user',
        } as never;
      }),
      resolveAgentEventActorReconciliation,
    });

    await handler(
      'conversation-1',
      job({
        status: 'error',
        error: 'run evidence was lost after the actor commit',
        agentEventExpectedAction: { toolName: 'submit_move' },
      }),
      [],
    );

    expect(resolveAgentEventActorReconciliation).toHaveBeenCalledWith({
      user: 'user-1',
      conversationId: 'conversation-1',
      invocationId: 'trigger_1',
      checkpoint,
      resolution: 'checkpoint_verified',
    });
    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'applied',
        action: { toolName: 'submit_move' },
      }),
    );
    expect(settleAgentTriggerHandlingOutcome.mock.calls[0][0]).not.toHaveProperty('error');
    /** The receipt's status CAS is the serialization point against concurrent
     * compensation, so verification must resolve BEFORE the public settle. */
    expect(resolveAgentEventActorReconciliation.mock.invocationCallOrder[0]).toBeLessThan(
      settleAgentTriggerHandlingOutcome.mock.invocationCallOrder[0],
    );
  });

  it('settles the actor receipt before clearing the conversation lifecycle', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const settleAgentEventActorReceipt = jest.fn().mockResolvedValue(true);
    const clearAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      settleAgentEventActorReceipt,
      clearAgentEventActorReconciliation,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            actionAdmitted: true,
            status: 'history_persisted',
            checkpoint,
            action: { toolName: 'submit_move', toolCallId: 'call-1' },
            observedAt: new Date(),
          },
        ],
      }),
      getMessage: jest.fn(async ({ messageId }) => {
        const isUser = messageId.endsWith(':user');
        return {
          messageId,
          conversationId: 'conversation-1',
          isCreatedByUser: isUser,
          parentMessageId: isUser ? 'parent-message' : 'trigger_1:user',
        } as never;
      }),
    });

    await handler(
      'conversation-1',
      job({ agentEventBindingId: 'binding-1', status: 'error', error: 'late provider error' }),
      [],
    );

    expect(settleAgentEventActorReceipt).toHaveBeenCalledWith({
      deliveryKey: 'trigger_1',
      user: 'user-1',
      bindingId: 'binding-1',
      conversationId: 'conversation-1',
      generationCreatedAt: 1_787_000_000_000,
      status: 'applied',
      settledAt: new Date(1_787_000_001_000),
      requiresActionAdmission: true,
      receipt: {
        resolution: 'checkpoint_verified',
        checkpoint,
        action: { toolName: 'submit_move', toolCallId: 'call-1' },
      },
    });
    expect(clearAgentEventActorReconciliation).toHaveBeenCalledWith({
      user: 'user-1',
      conversationId: 'conversation-1',
      invocationId: 'trigger_1',
      checkpoint,
      resolution: 'checkpoint_verified',
    });
    expect(settleAgentEventActorReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      clearAgentEventActorReconciliation.mock.invocationCallOrder[0],
    );
    expect(settleAgentTriggerHandlingOutcome).not.toHaveBeenCalled();
  });

  it('converges after a crash between actor receipt settlement and marker cleanup', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const settleAgentEventActorReceipt = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const receipt = {
      bindingId: 'binding-1',
      resolution: 'checkpoint_verified' as const,
      checkpoint,
      action: { toolName: 'submit_move' },
      settledAt: new Date(1_787_000_001_000),
    };
    const clearAgentEventActorReconciliation = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const getAgentEventActorReceipt = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(receipt);
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      settleAgentEventActorReceipt,
      clearAgentEventActorReconciliation,
      getAgentEventActorReceipt,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            actionAdmitted: true,
            status: 'history_persisted',
            checkpoint,
            action: receipt.action,
            observedAt: new Date(),
          },
        ],
      }),
      getMessage: jest.fn(async ({ messageId }) => {
        const isUser = messageId.endsWith(':user');
        return {
          messageId,
          conversationId: 'conversation-1',
          isCreatedByUser: isUser,
          parentMessageId: isUser ? 'parent-message' : 'trigger_1:user',
        } as never;
      }),
    });
    const actorJob = job({ agentEventBindingId: 'binding-1' });

    await expect(handler('conversation-1', actorJob, [])).rejects.toThrow(
      'terminal marker could not be cleared',
    );
    await handler('conversation-1', actorJob, []);

    expect(settleAgentEventActorReceipt).toHaveBeenCalledTimes(2);
    expect(settleAgentEventActorReceipt).toHaveBeenLastCalledWith({
      deliveryKey: 'trigger_1',
      user: 'user-1',
      bindingId: 'binding-1',
      conversationId: 'conversation-1',
      generationCreatedAt: 1_787_000_000_000,
      status: 'applied',
      settledAt: receipt.settledAt,
      receipt: {
        resolution: 'checkpoint_verified',
        checkpoint,
        action: receipt.action,
      },
    });
    expect(clearAgentEventActorReconciliation).toHaveBeenCalledTimes(2);
    expect(settleAgentTriggerHandlingOutcome).not.toHaveBeenCalled();
  });

  it('retains authoritative action proof until a failed settlement retry succeeds', async () => {
    const settleAgentTriggerHandlingOutcome = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const resolveAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const action = { toolName: 'submit_move', toolCallId: 'call-1' };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      /** The first attempt resolves the receipt but dies on the settle write;
       * the retry then observes the already-settled verified receipt. */
      getAgentEventActorSnapshot: jest
        .fn()
        .mockResolvedValueOnce({
          state: { generation: 1, checkpoint },
          reconciliations: [
            {
              invocationId: 'trigger_1',
              status: 'history_persisted',
              checkpoint,
              action,
              observedAt: new Date(),
            },
          ],
        })
        .mockResolvedValue({
          state: { generation: 1, checkpoint },
          reconciliations: [
            {
              invocationId: 'trigger_1',
              status: 'settled',
              resolution: 'checkpoint_verified',
              checkpoint,
              action,
              observedAt: new Date(),
            },
          ],
        }),
      getMessage: jest.fn(async ({ messageId }) => {
        const isUser = messageId.endsWith(':user');
        return {
          messageId,
          conversationId: 'conversation-1',
          isCreatedByUser: isUser,
          parentMessageId: isUser ? 'parent-message' : 'trigger_1:user',
        } as never;
      }),
      resolveAgentEventActorReconciliation,
    });

    await expect(
      handler('conversation-1', job({ status: 'error', error: 'lost run evidence' }), []),
    ).rejects.toThrow('Failed to settle agent event delivery trigger_1');
    expect(resolveAgentEventActorReconciliation).toHaveBeenCalledTimes(1);

    await handler('conversation-1', job({ status: 'error', error: 'lost run evidence' }), []);

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 'applied',
        action: { toolName: 'submit_move', toolCallId: 'call-1' },
      }),
    );
    expect(resolveAgentEventActorReconciliation).toHaveBeenCalledTimes(1);
  });

  it('honors a compensation that wins the receipt CAS during settlement', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const resolveAgentEventActorReconciliation = jest.fn().mockResolvedValue(false);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const action = { toolName: 'submit_move', toolCallId: 'call-1' };
    const getAgentEventActorSnapshot = jest
      .fn()
      .mockResolvedValueOnce({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'history_persisted',
            checkpoint,
            action,
            observedAt: new Date(),
          },
        ],
      })
      .mockResolvedValue({
        state: { generation: 1, checkpoint, requiresColdStart: true },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'settled',
            resolution: 'action_compensated',
            checkpoint,
            action,
            observedAt: new Date(),
          },
        ],
      });
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      getAgentEventActorSnapshot,
      getMessage: jest.fn(async ({ messageId }) => {
        const isUser = messageId.endsWith(':user');
        return {
          messageId,
          conversationId: 'conversation-1',
          isCreatedByUser: isUser,
          parentMessageId: isUser ? 'parent-message' : 'trigger_1:user',
        } as never;
      }),
      resolveAgentEventActorReconciliation,
    });

    await handler(
      'conversation-1',
      job({ agentEventExpectedAction: { toolName: 'submit_move' } }),
      [completedToolStep()],
    );

    /** Verification lost the receipt CAS to a concurrent compensation, so the
     * public outcome must honor the compensation, not the stale snapshot. */
    expect(getAgentEventActorSnapshot).toHaveBeenCalledTimes(2);
    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Applied event actor action was explicitly compensated',
      }),
    );
    expect(settleAgentTriggerHandlingOutcome.mock.calls[0][0]).not.toHaveProperty('action');
  });

  it('replays an applied settlement from its durable resolved lifecycle receipt', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const resolveAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'settled',
            checkpoint,
            action: { toolName: 'submit_move', toolCallId: 'call-1' },
            observedAt: new Date(),
          },
        ],
      }),
      resolveAgentEventActorReconciliation,
    });

    await handler(
      'conversation-1',
      job({ status: 'error', error: 'lost local evidence after settlement' }),
      [],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'applied',
        action: { toolName: 'submit_move', toolCallId: 'call-1' },
      }),
    );
    expect(resolveAgentEventActorReconciliation).not.toHaveBeenCalled();
  });

  it('lazily migrates a legacy settled receipt before deleting its embedded copy', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const backfillAgentEventActorReceipt = jest.fn().mockResolvedValue(true);
    const clearAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const observedAt = new Date('2026-08-25T00:00:00.000Z');
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      backfillAgentEventActorReceipt,
      clearAgentEventActorReconciliation,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'settled',
            resolution: 'checkpoint_verified',
            checkpoint,
            action: { toolName: 'submit_move', toolCallId: 'call-1' },
            observedAt,
          },
        ],
      }),
    });

    await handler('conversation-1', job({ agentEventBindingId: 'binding-1' }), []);

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith({
      deliveryKey: 'trigger_1',
      conversationId: 'conversation-1',
      generationCreatedAt: job().createdAt,
      status: 'applied',
      settledAt: observedAt,
      action: { toolName: 'submit_move', toolCallId: 'call-1' },
    });
    expect(backfillAgentEventActorReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: 'trigger_1',
        bindingId: 'binding-1',
        conversationId: 'conversation-1',
        status: 'applied',
        settledAt: observedAt,
        receipt: {
          resolution: 'checkpoint_verified',
          checkpoint,
          action: { toolName: 'submit_move', toolCallId: 'call-1' },
        },
      }),
    );
    expect(backfillAgentEventActorReceipt.mock.invocationCallOrder[0]).toBeLessThan(
      clearAgentEventActorReconciliation.mock.invocationCallOrder[0],
    );
    expect(settleAgentTriggerHandlingOutcome.mock.invocationCallOrder[0]).toBeLessThan(
      backfillAgentEventActorReceipt.mock.invocationCallOrder[0],
    );
  });

  it('keeps legacy proof intact when its public outcome cannot be recovered', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(false);
    const backfillAgentEventActorReceipt = jest.fn();
    const clearAgentEventActorReconciliation = jest.fn();
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      backfillAgentEventActorReceipt,
      clearAgentEventActorReconciliation,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'settled',
            resolution: 'checkpoint_verified',
            checkpoint,
            action: { toolName: 'submit_move', toolCallId: 'call-1' },
            observedAt: new Date('2026-08-25T00:00:00.000Z'),
          },
        ],
      }),
    });

    await expect(
      handler('conversation-1', job({ agentEventBindingId: 'binding-1' }), []),
    ).rejects.toThrow('legacy public outcome could not be recovered');

    expect(backfillAgentEventActorReceipt).not.toHaveBeenCalled();
    expect(clearAgentEventActorReconciliation).not.toHaveBeenCalled();
  });

  it('never replays a compensated receipt as applied even over fresh run evidence', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const resolveAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointId: 'checkpoint-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: { generation: 1, checkpoint, requiresColdStart: true },
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'settled',
            resolution: 'action_compensated',
            checkpoint,
            action: { toolName: 'submit_move', toolCallId: 'call-1' },
            observedAt: new Date(),
          },
        ],
      }),
      resolveAgentEventActorReconciliation,
    });

    /** The replayed generation still carries the original applied run step,
     * but compensation explicitly undid that effect: the public outcome must
     * not tell the source the operation stands. */
    await handler(
      'conversation-1',
      job({ status: 'error', agentEventExpectedAction: { toolName: 'submit_move' } }),
      [completedToolStep()],
    );

    expect(settleAgentTriggerHandlingOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Applied event actor action was explicitly compensated',
      }),
    );
    expect(settleAgentTriggerHandlingOutcome.mock.calls[0][0]).not.toHaveProperty('action');
    expect(resolveAgentEventActorReconciliation).not.toHaveBeenCalled();
  });

  it('preserves an ambiguous pre-action fence when terminal evidence is incomplete', async () => {
    const settleAgentTriggerHandlingOutcome = jest.fn().mockResolvedValue(true);
    const resolveAgentEventActorReconciliation = jest.fn().mockResolvedValue(true);
    const checkpoint = {
      threadId: 'conversation-1',
      checkpointNs: 'event-actor/trigger_1',
    };
    const handler = createAgentEventTerminalHandler({
      settleAgentTriggerHandlingOutcome,
      getAgentEventActorSnapshot: jest.fn().mockResolvedValue({
        state: null,
        reconciliations: [
          {
            invocationId: 'trigger_1',
            status: 'invocation_pending',
            checkpoint,
            action: { toolName: 'submit_move' },
            observedAt: new Date(),
          },
        ],
      }),
      resolveAgentEventActorReconciliation,
    });

    await expect(handler('conversation-1', job(), [])).rejects.toThrow(
      'requires invocation_pending reconciliation',
    );

    expect(resolveAgentEventActorReconciliation).not.toHaveBeenCalled();
    expect(settleAgentTriggerHandlingOutcome).not.toHaveBeenCalled();
  });
});

describe('createAgentEventActionRecorder', () => {
  const expectedAction = { toolName: 'submit_move', argumentSubset: { gameId: 'game-1' } };
  const successEnd = {
    input: { gameId: 'game-1', move: 'e4' },
    output: { name: 'submit_move', tool_call_id: 'call-1', content: '{"ok":true}' },
  };

  it('records the first qualifying execution and keeps it', async () => {
    const recorder = createAgentEventActionRecorder(expectedAction);
    expect(recorder.read()).toBeUndefined();
    recorder.observeToolEnd(successEnd);
    recorder.observeToolEnd({
      input: { gameId: 'game-1' },
      output: { name: 'submit_move', tool_call_id: 'call-2', content: '{"ok":true}' },
    });
    expect(recorder.read()).toEqual({ toolName: 'submit_move', toolCallId: 'call-1' });
  });

  it('accepts the MCP-suffixed form of the expected tool', async () => {
    const recorder = createAgentEventActionRecorder(expectedAction);
    recorder.observeToolEnd({
      ...successEnd,
      output: { ...successEnd.output, name: 'submit_move_mcp_chess' },
    });
    expect(recorder.read()).toEqual({ toolName: 'submit_move_mcp_chess', toolCallId: 'call-1' });
  });

  it('enforces the fenced argument subset against the execution input', async () => {
    const recorder = createAgentEventActionRecorder(expectedAction);
    recorder.observeToolEnd({ ...successEnd, input: { gameId: 'other-game', move: 'e4' } });
    recorder.observeToolEnd({ ...successEnd, input: undefined });
    expect(recorder.read()).toBeUndefined();
  });

  it('never qualifies an argument-fenced action from an output-only tool end', async () => {
    /** Live-canary shape: the stream-consumer tool-end path delivers no
     * execution input, so a declared argument subset can never be verified —
     * the receipt must starve rather than trust an unfenced match. The
     * execution handler is required to supply the input (see handlers.spec). */
    const recorder = createAgentEventActionRecorder(expectedAction);
    recorder.observeToolEnd({ output: successEnd.output });
    expect(recorder.read()).toBeUndefined();
  });

  it('qualifies a name-only expected action from an output-only tool end', async () => {
    const recorder = createAgentEventActionRecorder({ toolName: 'submit_move' });
    recorder.observeToolEnd({ output: successEnd.output });
    expect(recorder.read()).toEqual({ toolName: 'submit_move', toolCallId: 'call-1' });
  });

  it('accepts policy-withheld output as proof of a successful foreground execution', async () => {
    /** Output filtering blanks the returned content AFTER the side effect
     * happened; reclassifying the turn as actionless would re-execute an
     * applied external action on retry. */
    const recorder = createAgentEventActionRecorder(expectedAction);
    recorder.observeToolEnd({
      input: { gameId: 'game-1', move: 'e4' },
      outputFiltered: true,
      output: { name: 'submit_move', tool_call_id: 'call-filtered', content: '' },
    });
    expect(recorder.read()).toEqual({ toolName: 'submit_move', toolCallId: 'call-filtered' });
  });

  it('never qualifies a withheld output whose call the model detached', async () => {
    const recorder = createAgentEventActionRecorder({ toolName: 'submit_move' });
    recorder.observeToolEnd({
      input: { gameId: 'game-1', run_in_background: true },
      outputFiltered: true,
      output: { name: 'submit_move', tool_call_id: 'call-detached', content: '' },
    });
    expect(recorder.read()).toBeUndefined();
  });

  it('never lets a background-task delivery impersonate a name-only action', async () => {
    /** The poll turn's delivery callback reports the ORIGINAL tool's name for
     * artifact attribution — evidence of work another turn dispatched, not
     * proof this invocation performed its expected action. */
    const recorder = createAgentEventActionRecorder({ toolName: 'submit_move' });
    recorder.observeToolEnd({
      input: { background_task_id: 'task-1' },
      backgroundDelivery: true,
      output: { name: 'submit_move', tool_call_id: 'call-poll', content: '{"ok":true}' },
    });
    expect(recorder.read()).toBeUndefined();
  });

  it('never records name mismatches, errored results, or malformed outputs', async () => {
    const recorder = createAgentEventActionRecorder(expectedAction);
    recorder.observeToolEnd({ ...successEnd, output: { ...successEnd.output, name: 'resign' } });
    recorder.observeToolEnd({
      ...successEnd,
      output: { ...successEnd.output, status: 'error' },
    });
    recorder.observeToolEnd({ ...successEnd, output: { ...successEnd.output, content: null } });
    recorder.observeToolEnd({ ...successEnd, output: undefined });
    recorder.observeToolEnd({ input: successEnd.input, output: 'plain-string' });
    expect(recorder.read()).toBeUndefined();
  });

  it('excludes background non-execution receipts', async () => {
    const recorder = createAgentEventActionRecorder({ toolName: 'submit_move' });
    recorder.observeToolEnd({
      input: { gameId: 'game-1', run_in_background: true },
      output: {
        name: 'submit_move',
        tool_call_id: 'call-bg',
        content: JSON.stringify({ status: 'running', background_task_id: 'task-1' }),
      },
    });
    expect(recorder.read()).toBeUndefined();
  });

  it('records nothing without a declared expected action', async () => {
    const recorder = createAgentEventActionRecorder(undefined);
    recorder.observeToolEnd(successEnd);
    expect(recorder.read()).toBeUndefined();
  });
});
