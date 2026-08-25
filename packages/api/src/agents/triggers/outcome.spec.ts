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
