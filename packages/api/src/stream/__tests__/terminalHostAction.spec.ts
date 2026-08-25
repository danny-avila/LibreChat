import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

describe('GenerationJobManager terminal host actions', () => {
  let manager: GenerationJobManagerClass;
  let store: InMemoryJobStore;

  beforeEach(() => {
    manager = new GenerationJobManagerClass();
    store = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    manager.configure({
      jobStore: store,
      eventTransport: new InMemoryEventTransport(),
      cleanupOnComplete: false,
    });
    manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  it('runs and acknowledges a generation-fenced host action before terminal cleanup', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const job = await manager.createJob('conversation-1', 'user-1', 'conversation-1', {
      initialMetadata: {
        agentEventDeliveryKey: 'trigger_1',
        agentEventExpectedAction: { toolName: 'submit_move' },
      },
    });
    await manager.emitChunk('conversation-1', {
      event: 'on_run_step',
      data: {
        id: 'step-1',
        index: 0,
        type: 'tool_calls',
        status: 'in_progress',
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-1', name: 'submit_move', args: { gameId: 'game-1' } }],
        },
      },
    });
    await manager.emitChunk('conversation-1', {
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-1',
          index: 0,
          type: 'tool_call',
          tool_call: { id: 'call-1', name: 'submit_move', output: 'ok' },
        },
      },
    });

    await expect(manager.completeJob('conversation-1', undefined, job.createdAt)).resolves.toBe(
      true,
    );

    expect(handler).toHaveBeenCalledWith(
      'conversation-1',
      expect.objectContaining({
        createdAt: job.createdAt,
        agentEventDeliveryKey: 'trigger_1',
        status: 'complete',
      }),
      [
        expect.objectContaining({
          id: 'step-1',
          status: 'completed',
          stepDetails: expect.objectContaining({
            tool_calls: [
              expect.objectContaining({
                id: 'call-1',
                args: { gameId: 'game-1' },
                output: 'ok',
              }),
            ],
          }),
        }),
      ],
      expect.any(Array),
    );
    await expect(store.getJob('conversation-1')).resolves.not.toHaveProperty(
      'terminalHostActionPending',
    );
  });

  it('waits for the provider evidence fence and retains a failed tool close', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const streamId = 'conversation-provider-evidence';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: {
        agentEventDeliveryKey: 'trigger_provider_evidence',
      },
    });
    const providerExecutionId = job.metadata.providerExecutionId!;
    await expect(
      manager.beginProviderExecution(streamId, job.createdAt, providerExecutionId),
    ).resolves.toBe(true);
    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: {
        id: 'step-failed',
        index: 0,
        type: 'tool_calls',
        status: 'in_progress',
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-failed', name: 'submit_move', args: {} }],
        },
      },
    });
    await manager.emitChunk(streamId, {
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-failed',
          index: 0,
          type: 'tool_call',
          tool_call: {
            id: 'call-failed',
            name: 'submit_move',
            output: 'Error: [submit_move] tool call failed: unavailable',
          },
        },
      },
    });
    await manager.emitChunk(streamId, {
      event: 'on_run_step_closed',
      data: {
        id: 'step-failed',
        index: 0,
        type: 'tool_calls',
        status: 'failed',
        closed_at: Date.now(),
      },
    });

    await expect(manager.completeJob(streamId, undefined, job.createdAt)).resolves.toBe(true);
    expect(handler).not.toHaveBeenCalled();
    await expect(store.getJob(streamId)).resolves.toMatchObject({
      providerDrained: false,
      terminalHostActionPending: true,
    });

    await expect(
      manager.markProviderExecutionDrained(streamId, job.createdAt, providerExecutionId),
    ).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({ providerDrained: true }),
      [
        expect.objectContaining({
          id: 'step-failed',
          status: 'failed',
          stepDetails: expect.objectContaining({
            tool_calls: [expect.objectContaining({ executionStatus: 'error' })],
          }),
        }),
      ],
      expect.any(Array),
    );
    await expect(store.getJob(streamId)).resolves.not.toHaveProperty('terminalHostActionPending');
  });

  it('routes a post-drain approval expiry through the schedule-specific hook', async () => {
    const approvalHandler = jest.fn().mockResolvedValue(undefined);
    const genericHandler = jest.fn().mockResolvedValue(undefined);
    manager.setApprovalExpiredHandler(approvalHandler);
    manager.setTerminalHostActionHandler(genericHandler);
    const streamId = 'conversation-expired-approval-drain';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { scheduleId: 'schedule-1' },
    });
    const providerExecutionId = job.metadata.providerExecutionId!;
    await manager.beginProviderExecution(streamId, job.createdAt, providerExecutionId);
    await expect(
      store.transitionStatus(streamId, {
        from: 'running',
        to: 'aborted',
        expectCreatedAt: job.createdAt,
        patch: {
          completedAt: Date.now(),
          error: 'Approval expired before a decision was made',
          terminalHostActionPending: true,
        },
      }),
    ).resolves.toBe(true);

    await manager.markProviderExecutionDrained(streamId, job.createdAt, providerExecutionId);

    expect(approvalHandler).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({ scheduleId: 'schedule-1', providerDrained: true }),
    );
    expect(genericHandler).not.toHaveBeenCalled();
    await expect(store.getJob(streamId)).resolves.not.toHaveProperty('terminalHostActionPending');
  });

  it('recovers a terminal host action after its provider owner is lost', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
    try {
      const handler = jest.fn().mockResolvedValue(undefined);
      manager.setTerminalHostActionHandler(handler);
      const streamId = 'conversation-lost-provider-owner';
      const job = await manager.createJob(streamId, 'user-1', streamId, {
        initialMetadata: { agentEventDeliveryKey: 'trigger_lost_provider' },
      });
      await manager.beginProviderExecution(
        streamId,
        job.createdAt,
        job.metadata.providerExecutionId!,
      );
      await manager.completeJob(streamId, undefined, job.createdAt);
      expect(handler).not.toHaveBeenCalled();

      now.mockReturnValue(40_001);
      await (
        manager as unknown as { expireStaleApprovals: () => Promise<void> }
      ).expireStaleApprovals();

      expect(handler).toHaveBeenCalledWith(
        streamId,
        expect.objectContaining({ providerDrained: true }),
        expect.any(Array),
        expect.any(Array),
      );
      await expect(store.getJob(streamId)).resolves.not.toHaveProperty('terminalHostActionPending');
    } finally {
      now.mockRestore();
    }
  });

  it('serializes run-step snapshots so an earlier write cannot erase completion evidence', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const streamId = 'conversation-run-step-order';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { agentEventDeliveryKey: 'trigger_run_step_order' },
    });
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const writes: Array<Array<{ status?: string }>> = [];
    Object.assign(store, { saveRunSteps: jest.fn() });
    jest
      .spyOn(store as InMemoryJobStore & { saveRunSteps: jest.Mock }, 'saveRunSteps')
      .mockImplementation(async (_id, steps) => {
        writes.push(structuredClone(steps));
        if (writes.length === 1) {
          await firstWrite;
        }
      });

    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: {
        id: 'step-ordered',
        index: 0,
        type: 'tool_calls',
        status: 'in_progress',
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [{ id: 'call-ordered', name: 'submit_move', args: {} }],
        },
      },
    });
    await manager.emitChunk(streamId, {
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-ordered',
          index: 0,
          type: 'tool_call',
          tool_call: { id: 'call-ordered', name: 'submit_move', output: 'ok' },
        },
      },
    });

    const completing = manager.completeJob(streamId, undefined, job.createdAt);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(handler).not.toHaveBeenCalled();
    releaseFirstWrite?.();
    await expect(completing).resolves.toBe(true);

    expect(writes[writes.length - 1]).toEqual([expect.objectContaining({ status: 'completed' })]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('retains a failed host action and lets a later cleanup owner retry it', async () => {
    manager.setTerminalHostActionHandler(jest.fn().mockRejectedValue(new Error('mongo down')));
    const job = await manager.createJob('conversation-2', 'user-1', 'conversation-2', {
      initialMetadata: {
        agentEventDeliveryKey: 'trigger_2',
        agentEventExpectedAction: { toolName: 'submit_move' },
      },
    });
    await manager.emitChunk('conversation-2', {
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-2',
          index: 0,
          type: 'tool_calls',
          status: 'completed',
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'call-2', name: 'submit_move', output: 'ok' }],
          },
        },
      },
    });
    await manager.completeJob('conversation-2', undefined, job.createdAt);
    await expect(store.getJob('conversation-2')).resolves.toMatchObject({
      terminalHostActionPending: true,
    });

    const recovered = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(recovered);
    await (
      manager as unknown as {
        cleanup: () => Promise<void>;
      }
    ).cleanup();

    expect(recovered).toHaveBeenCalledWith(
      'conversation-2',
      expect.objectContaining({ createdAt: job.createdAt, agentEventDeliveryKey: 'trigger_2' }),
      [expect.objectContaining({ id: 'step-2', status: 'completed' })],
      expect.any(Array),
    );
    await expect(store.getJob('conversation-2')).resolves.not.toHaveProperty(
      'terminalHostActionPending',
    );
  });

  it('retains completed run-step evidence through repeated host-action failures', async () => {
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('mongo down'))
      .mockRejectedValueOnce(new Error('mongo still down'))
      .mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const job = await manager.createJob('conversation-retry', 'user-1', 'conversation-retry', {
      initialMetadata: { agentEventDeliveryKey: 'trigger_retry' },
    });
    await manager.emitChunk('conversation-retry', {
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-retry',
          index: 0,
          type: 'tool_calls',
          status: 'completed',
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'call-retry', name: 'submit_move', output: 'ok' }],
          },
        },
      },
    });
    await manager.completeJob('conversation-retry', undefined, job.createdAt);

    const cleanup = () =>
      (
        manager as unknown as {
          cleanup: () => Promise<void>;
        }
      ).cleanup();
    await cleanup();
    await expect(store.getJob('conversation-retry')).resolves.toMatchObject({
      terminalHostActionPending: true,
    });

    await cleanup();

    expect(handler).toHaveBeenLastCalledWith(
      'conversation-retry',
      expect.objectContaining({ agentEventDeliveryKey: 'trigger_retry' }),
      [expect.objectContaining({ id: 'step-retry', status: 'completed' })],
      expect.any(Array),
    );
    await expect(store.getJob('conversation-retry')).resolves.not.toHaveProperty(
      'terminalHostActionPending',
    );
  });

  it('does not let a stale buffered step replace completed durable evidence', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const streamId = 'conversation-completed-evidence';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { agentEventDeliveryKey: 'trigger_completed' },
    });
    const completedStep = {
      id: 'step-shared',
      index: 0,
      type: 'tool_calls',
      status: 'completed',
      stepDetails: {
        type: 'tool_calls',
        tool_calls: [{ id: 'call-shared', name: 'submit_move', output: 'ok' }],
      },
    };
    store.setGraph(streamId, { contentData: [completedStep] } as never, job.createdAt);
    await manager.emitChunk(streamId, {
      event: 'on_run_step',
      data: { ...completedStep, status: 'in_progress' },
    });

    await manager.completeJob(streamId, undefined, job.createdAt);

    expect(handler).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({ agentEventDeliveryKey: 'trigger_completed' }),
      [expect.objectContaining({ id: 'step-shared', status: 'completed' })],
      expect.any(Array),
    );
  });

  it('marks an aborted event generation for terminal handling', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const job = await manager.createJob('conversation-3', 'user-1', 'conversation-3', {
      initialMetadata: { agentEventDeliveryKey: 'trigger_3' },
    });

    await expect(
      manager.abortJob('conversation-3', { expectedCreatedAt: job.createdAt }),
    ).resolves.toMatchObject({ success: true });

    expect(handler).toHaveBeenCalledWith(
      'conversation-3',
      expect.objectContaining({
        createdAt: job.createdAt,
        agentEventDeliveryKey: 'trigger_3',
        status: 'aborted',
      }),
      [],
      expect.any(Array),
    );
    await expect(store.getJob('conversation-3')).resolves.not.toHaveProperty(
      'terminalHostActionPending',
    );
  });

  it('settles a bound generation when graceful shutdown terminalizes it', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const streamId = 'conversation-shutdown';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { agentEventDeliveryKey: 'trigger_shutdown' },
    });

    await (
      manager as unknown as { finalizeOwnedJobsForShutdown: () => Promise<void> }
    ).finalizeOwnedJobsForShutdown();

    expect(handler).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({
        createdAt: job.createdAt,
        agentEventDeliveryKey: 'trigger_shutdown',
        status: 'error',
      }),
      [],
      expect.any(Array),
    );
    await expect(store.getJob(streamId)).resolves.not.toHaveProperty('terminalHostActionPending');
  });

  it('settles a bound generation when pause persistence times out', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const handler = jest.fn().mockResolvedValue(undefined);
    manager.setTerminalHostActionHandler(handler);
    const streamId = 'conversation-pause-timeout';
    const job = await manager.createJob(streamId, 'user-1', streamId, {
      initialMetadata: { agentEventDeliveryKey: 'trigger_pause_timeout' },
    });
    const action = buildPendingAction(
      buildToolApprovalPayload([
        { name: 'submit_move', arguments: { gameId: 'game-1' }, tool_call_id: 'call-1' },
      ]),
      { streamId, conversationId: streamId },
    );
    await expect(
      manager.approvals.pause(streamId, action, {
        expectedCreatedAt: job.createdAt,
        persistencePending: true,
      }),
    ).resolves.toBe(true);

    now.mockReturnValue(31_001);
    await (manager as unknown as { cleanup: () => Promise<void> }).cleanup();

    expect(handler).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({
        agentEventDeliveryKey: 'trigger_pause_timeout',
        status: 'error',
      }),
      [],
      expect.any(Array),
    );
    await expect(store.getJob(streamId)).resolves.not.toHaveProperty('terminalHostActionPending');
    now.mockRestore();
  });
});
