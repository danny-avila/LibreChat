import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
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
      event: 'on_run_step_completed',
      data: {
        result: {
          id: 'step-1',
          index: 0,
          type: 'tool_calls',
          status: 'completed',
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [{ id: 'call-1', name: 'submit_move', output: 'ok' }],
          },
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
      [expect.objectContaining({ id: 'step-1', status: 'completed' })],
    );
    await expect(store.getJob('conversation-1')).resolves.not.toHaveProperty(
      'terminalHostActionPending',
    );
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
    );
    await expect(store.getJob('conversation-3')).resolves.not.toHaveProperty(
      'terminalHostActionPending',
    );
  });
});
