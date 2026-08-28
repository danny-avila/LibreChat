import { createAgentEventActorDetachedActionLifecycle } from './detachedAction';

describe('createAgentEventActorDetachedActionLifecycle', () => {
  it('owns only the exact expected action and exposes a suspension after launch', async () => {
    const action = {
      version: 1 as const,
      invocationId: 'delivery-1',
      expectedToolName: 'submit_move',
      toolName: 'submit_move_mcp_chess',
      toolCallId: 'call-1',
      taskId: `event_actor_${'a'.repeat(64)}`,
      idempotencyKey: 'a'.repeat(64),
      launchAttempt: 0 as const,
      status: 'reserved' as const,
      reservedAt: new Date('2026-08-28T12:00:00.000Z'),
      observedAt: new Date('2026-08-28T12:00:00.000Z'),
    };
    const reserve = jest.fn(async () => ({ status: 'reserved' as const, action }));
    const markRunning = jest.fn(async () => true);
    const settle = jest.fn(async () => true);
    const wake = jest.fn(async () => undefined);
    const lifecycle = createAgentEventActorDetachedActionLifecycle(
      {
        user: 'user-1',
        tenantId: 'tenant-1',
        bindingId: 'binding-1',
        conversationId: 'conversation-1',
        generationCreatedAt: 123,
        invocationId: 'delivery-1',
        expectedAction: {
          toolName: 'submit_move',
          argumentSubset: { gameId: 'game-1' },
        },
      },
      {
        reserveAgentEventActorDetachedAction: reserve,
        markAgentEventActorDetachedActionRunning: markRunning,
        settleAgentEventActorDetachedAction: settle,
        onTerminal: wake,
        now: () => new Date('2026-08-28T12:00:00.000Z'),
      },
    );

    await expect(
      lifecycle.reserve({
        toolName: 'unrelated_tool',
        toolCallId: 'call-0',
        arguments: { gameId: 'game-1' },
      }),
    ).resolves.toEqual({ status: 'ignored' });
    await expect(
      lifecycle.reserve({
        toolName: 'submit_move_mcp_chess',
        toolCallId: 'call-1',
        arguments: { gameId: 'game-1', move: 'e4' },
      }),
    ).resolves.toEqual({
      status: 'reserved',
      taskId: action.taskId,
      idempotencyKey: action.idempotencyKey,
    });
    expect(lifecycle.readSuspension()).toBeUndefined();

    await expect(
      lifecycle.markRunning({ taskId: action.taskId, idempotencyKey: action.idempotencyKey }),
    ).resolves.toBe(true);

    expect(lifecycle.readSuspension()).toEqual({
      kind: 'internal_completion',
      actionId: action.taskId,
      jobCreatedAt: 123,
      interrupt: {
        id: action.taskId,
        payload: {
          type: 'event_actor_detached_action',
          taskId: action.taskId,
          idempotencyKey: action.idempotencyKey,
        },
      },
    });
    await expect(
      lifecycle.settle({
        taskId: action.taskId,
        idempotencyKey: action.idempotencyKey,
        status: 'succeeded',
        result: { content: 'move accepted' },
      }),
    ).resolves.toBe(true);
    await lifecycle.wake({ taskId: action.taskId, idempotencyKey: action.idempotencyKey });
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', result: '{"content":"move accepted"}' }),
    );
    expect(wake).toHaveBeenCalledWith({
      taskId: action.taskId,
      idempotencyKey: action.idempotencyKey,
    });
  });

  it('returns exact terminal evidence instead of projecting a stale running handle', async () => {
    const action = {
      version: 1 as const,
      invocationId: 'delivery-1',
      expectedToolName: 'submit_move',
      toolName: 'submit_move_mcp_chess',
      toolCallId: 'call-terminal',
      taskId: `event_actor_${'b'.repeat(64)}`,
      idempotencyKey: 'b'.repeat(64),
      launchAttempt: 1,
      status: 'failed' as const,
      reservedAt: new Date(),
      observedAt: new Date(),
      settledAt: new Date(),
      error: 'service unavailable',
    };
    const lifecycle = createAgentEventActorDetachedActionLifecycle(
      {
        user: 'user-1',
        bindingId: 'binding-1',
        conversationId: 'conversation-1',
        generationCreatedAt: 123,
        invocationId: 'delivery-1',
        expectedAction: { toolName: 'submit_move' },
      },
      {
        reserveAgentEventActorDetachedAction: jest.fn(async () => ({
          status: 'replay' as const,
          action,
        })),
        markAgentEventActorDetachedActionRunning: jest.fn(),
        settleAgentEventActorDetachedAction: jest.fn(),
        onTerminal: jest.fn(),
      },
    );

    await expect(
      lifecycle.reserve({
        toolName: action.toolName,
        toolCallId: action.toolCallId,
        arguments: {},
      }),
    ).resolves.toEqual({
      status: 'terminal',
      taskId: action.taskId,
      idempotencyKey: action.idempotencyKey,
      outcome: 'failed',
      error: action.error,
    });
    expect(lifecycle.readSuspension()).toBeUndefined();
  });
});
