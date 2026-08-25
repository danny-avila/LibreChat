import { StepTypes } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import type { SerializableJobData } from '~/stream';
import { createAgentEventTerminalHandler } from './outcome';

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
});
