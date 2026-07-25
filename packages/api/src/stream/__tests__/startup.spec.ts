import type { AgentStartupTelemetry } from '~/agents/startup';
import type { ServerSentEvent } from '~/types';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { registerChunkPublicationCapability } from '~/stream/internal/chunkPublication';
import { buildPendingAction, buildToolApprovalPayload } from '~/agents/hitl/policy';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

function createTelemetry(): jest.Mocked<AgentStartupTelemetry> {
  return {
    mark: jest.fn(),
    setStreamId: jest.fn(),
    recordGenerationEvent: jest.fn().mockReturnValue(false),
    end: jest.fn(),
  };
}

function createManager(): GenerationJobManagerClass {
  const manager = new GenerationJobManagerClass();
  manager.configure({
    jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
    eventTransport: new InMemoryEventTransport(),
    isRedis: false,
  });
  manager.initialize();
  return manager;
}

function createPendingAction(streamId: string) {
  return buildPendingAction(
    buildToolApprovalPayload([
      { name: 'shell', arguments: { command: 'ls' }, tool_call_id: 'call-shutdown' },
    ]),
    {
      streamId,
      conversationId: streamId,
      runId: 'run-shutdown',
      responseMessageId: 'response-shutdown',
    },
  );
}

describe('GenerationJobManager startup telemetry', () => {
  it('returns sanitized initial metadata from the atomic job creation', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const updateJob = jest.spyOn(jobStore, 'updateJob');
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();

    const job = await manager.createJob('stream-initial-metadata', 'user-1', 'conversation-1', {
      initialMetadata: {
        userId: 'untrusted-user',
        tenantId: 'untrusted-tenant',
        conversationId: 'untrusted-conversation',
        userMessage: {
          messageId: 'message-1',
          parentMessageId: 'parent-1',
        },
        responseMessageId: 'response-1',
        sender: 'Agent',
        endpoint: 'agents',
        iconURL: 'https://example.com/icon.png',
        model: 'test-model',
        agent_id: 'agent-1',
        isTemporary: false,
        promptTokens: 0,
        discoveredTools: [],
        pendingAction: {
          actionId: 'untrusted-action',
          streamId: 'stream-initial-metadata',
          conversationId: 'conversation-1',
          payload: {
            type: 'ask_user_question',
            question: { question: 'Should not be persisted?' },
          },
          createdAt: Date.now(),
        },
      },
    });

    expect(job.metadata).toMatchObject({
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: {
        messageId: 'message-1',
        parentMessageId: 'parent-1',
      },
      responseMessageId: 'response-1',
      sender: 'Agent',
      endpoint: 'agents',
      iconURL: 'https://example.com/icon.png',
      model: 'test-model',
      agent_id: 'agent-1',
      isTemporary: false,
      promptTokens: 0,
      discoveredTools: [],
    });
    expect(job.metadata.tenantId).toBeUndefined();
    expect(job.metadata.pendingAction).toBeUndefined();
    expect(updateJob).not.toHaveBeenCalled();

    await manager.destroy();
  });

  it('clears omitted per-turn identity when an in-memory job is replaced', async () => {
    const manager = createManager();
    await manager.createJob('stream-replaced-metadata', 'user-1', 'conversation-1', {
      initialMetadata: {
        agent_id: 'agent-1',
        isTemporary: true,
        discoveredTools: ['deferred-tool'],
      },
    });

    const replacement = await manager.createJob(
      'stream-replaced-metadata',
      'user-1',
      'conversation-1',
    );

    expect(replacement.metadata.agent_id).toBeUndefined();
    expect(replacement.metadata.isTemporary).toBeUndefined();
    expect(replacement.metadata.discoveredTools).toBeUndefined();

    await manager.destroy();
  });

  it('preserves updateMetadata truthiness semantics through the shared sanitizer', async () => {
    const manager = createManager();
    await manager.createJob('stream-metadata-update', 'user-1', 'conversation-1', {
      initialMetadata: {
        sender: 'Agent',
        agent_id: 'agent-1',
        isTemporary: true,
        promptTokens: 42,
        discoveredTools: ['deferred-tool'],
      },
    });

    await manager.updateMetadata('stream-metadata-update', {
      sender: '',
      agent_id: '',
      isTemporary: false,
      promptTokens: 0,
      discoveredTools: [],
    });

    const updated = await manager.getJob('stream-metadata-update');
    expect(updated?.metadata).toMatchObject({
      sender: 'Agent',
      agent_id: 'agent-1',
      isTemporary: false,
      promptTokens: 0,
      discoveredTools: [],
    });

    await manager.destroy();
  });

  it('records accepted events centrally and detaches after the first content delta', async () => {
    const manager = createManager();
    const telemetry = createTelemetry();
    telemetry.recordGenerationEvent.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await manager.createJob('stream-1', 'user-1', 'conversation-1', {
      startupTelemetry: telemetry,
    });

    await manager.emitChunk('stream-1', {
      created: true,
      message: {
        messageId: 'message-1',
        sender: 'User',
        isCreatedByUser: true,
      },
      streamId: 'stream-1',
    });
    await manager.emitChunk('stream-1', {
      event: 'on_run_step',
      data: { id: 'step-1' },
    });
    await manager.emitChunk('stream-1', {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'Hello' }] } },
    });
    await manager.emitChunk('stream-1', {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: ' later token' }] } },
    });

    expect(telemetry.mark).toHaveBeenCalledWith('request_message_queued');
    expect(telemetry.recordGenerationEvent).toHaveBeenCalledTimes(2);
    expect(telemetry.recordGenerationEvent).toHaveBeenNthCalledWith(1, {
      event: 'on_run_step',
      data: { id: 'step-1' },
    });
    expect(telemetry.recordGenerationEvent).toHaveBeenNthCalledWith(2, {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'Hello' }] } },
    });

    await manager.destroy();
  });

  it('records a final-only response event before completion', async () => {
    const manager = createManager();
    const telemetry = createTelemetry();
    await manager.createJob('stream-2', 'user-1', 'conversation-2', {
      startupTelemetry: telemetry,
    });

    const finalEvent: ServerSentEvent = {
      final: true,
      responseMessage: {
        messageId: 'response-1',
        content: [{ type: 'text', text: 'Complete response' }],
      },
    };
    await manager.emitDone('stream-2', finalEvent);
    await manager.completeJob('stream-2');

    expect(telemetry.recordGenerationEvent).toHaveBeenCalledWith(finalEvent);
    expect(telemetry.end).toHaveBeenCalledWith('completed_without_delta');

    await manager.destroy();
  });

  it('does not record an event when delivery is rejected for an active subscriber', async () => {
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport,
      isRedis: false,
    });
    manager.initialize();
    const telemetry = createTelemetry();
    await manager.createJob('stream-3', 'user-1', 'conversation-3', {
      startupTelemetry: telemetry,
    });
    const subscription = await manager.subscribe('stream-3', () => undefined);
    registerChunkPublicationCapability(eventTransport, async () => false);

    await manager.emitChunk('stream-3', {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'Dropped' }] } },
    });

    expect(telemetry.recordGenerationEvent).not.toHaveBeenCalled();

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('bypasses publication receipts after startup telemetry completes', async () => {
    const eventTransport = new InMemoryEventTransport();
    const emitChunk = jest.spyOn(eventTransport, 'emitChunk');
    const publishWithReceipt = jest.fn().mockResolvedValue(0);
    registerChunkPublicationCapability(eventTransport, publishWithReceipt);
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport,
      isRedis: false,
    });
    manager.initialize();
    const telemetry = createTelemetry();
    telemetry.recordGenerationEvent.mockReturnValue(true);
    const job = await manager.createJob('stream-hot-path', 'user-1', 'conversation-1', {
      startupTelemetry: telemetry,
    });
    const subscription = await manager.subscribe('stream-hot-path', () => undefined);
    const firstDelta: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'First' }] } },
    };
    const laterDelta: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: ' later' }] } },
    };

    await manager.emitChunk('stream-hot-path', firstDelta);
    await manager.emitChunk('stream-hot-path', laterDelta);

    expect(publishWithReceipt).toHaveBeenCalledTimes(1);
    expect(publishWithReceipt).toHaveBeenCalledWith('stream-hot-path', firstDelta, job.createdAt);
    expect(emitChunk).toHaveBeenCalledTimes(1);
    expect(emitChunk).toHaveBeenCalledWith('stream-hot-path', laterDelta, job.createdAt);

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('does not let a later delta overtake a created event metadata write', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalUpdateJob = jobStore.updateJob.bind(jobStore);
    let signalCreatedWriteStarted: (() => void) | undefined;
    const createdWriteStarted = new Promise<void>((resolve) => {
      signalCreatedWriteStarted = resolve;
    });
    let releaseCreatedWrite: (() => void) | undefined;
    const createdWriteGate = new Promise<void>((resolve) => {
      releaseCreatedWrite = resolve;
    });
    jest
      .spyOn(jobStore, 'updateJob')
      .mockImplementation(async (streamId, updates, expectedCreatedAt) => {
        if (updates.createdEventEmitted === true) {
          signalCreatedWriteStarted?.();
          await createdWriteGate;
        }
        return originalUpdateJob(streamId, updates, expectedCreatedAt);
      });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    await manager.createJob('stream-created-order', 'user-1', 'conversation-1');

    const createdEvent: ServerSentEvent = {
      created: true,
      message: {
        messageId: 'message-1',
        conversationId: 'conversation-1',
        sender: 'User',
        isCreatedByUser: true,
      },
      streamId: 'stream-created-order',
    };
    const deltaEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'Hello' }] } },
    };
    const createdPublication = manager.emitChunk('stream-created-order', createdEvent);
    await createdWriteStarted;

    let deltaSettled = false;
    const deltaPublication = manager.emitChunk('stream-created-order', deltaEvent).then(() => {
      deltaSettled = true;
    });
    await Promise.resolve();
    expect(deltaSettled).toBe(false);

    releaseCreatedWrite?.();
    await Promise.all([createdPublication, deltaPublication]);

    const received: ServerSentEvent[] = [];
    const subscription = await manager.subscribe('stream-created-order', (event) =>
      received.push(event),
    );
    expect(received).toEqual([createdEvent, deltaEvent]);

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('ends an active startup when the manager shuts down', async () => {
    const manager = createManager();
    const telemetry = createTelemetry();
    const job = await manager.createJob('stream-4', 'user-1', 'conversation-4', {
      startupTelemetry: telemetry,
    });

    await manager.destroy();

    expect(telemetry.end).toHaveBeenCalledWith('aborted');
    expect(job.abortController.signal.aborted).toBe(true);
  });

  it('ends replaced startup telemetry before aborting the old runtime', async () => {
    const manager = createManager();
    const telemetry = createTelemetry();
    const oldJob = await manager.createJob('stream-5', 'user-1', 'conversation-5', {
      startupTelemetry: telemetry,
    });
    oldJob.abortController.signal.addEventListener('abort', () => {
      expect(telemetry.end).toHaveBeenCalledWith('replaced');
    });

    await manager.createJob('stream-5', 'user-1', 'conversation-5');

    expect(oldJob.abortController.signal.aborted).toBe(true);
    expect(telemetry.end).toHaveBeenCalledWith('replaced');
    await manager.destroy();
  });

  it('shares one lazy runtime across concurrent first subscriptions', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    await jobStore.createJob('stream-lazy-concurrent', 'user-1', 'conversation-1');

    const originalGetJob = jobStore.getJob.bind(jobStore);
    let lookupCount = 0;
    let signalLookupsStarted: (() => void) | undefined;
    const lookupsStarted = new Promise<void>((resolve) => {
      signalLookupsStarted = resolve;
    });
    let releaseLookups: (() => void) | undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    jest.spyOn(jobStore, 'getJob').mockImplementation(async (...args) => {
      const job = await originalGetJob(...args);
      if (lookupCount < 2) {
        lookupCount++;
        if (lookupCount === 2) {
          signalLookupsStarted?.();
        }
        await lookupGate;
      }
      return job;
    });
    const allSubscribersLeftSpy = jest.spyOn(eventTransport, 'onAllSubscribersLeft');

    const firstSubscription = manager.subscribe('stream-lazy-concurrent', () => undefined);
    const secondSubscription = manager.subscribe('stream-lazy-concurrent', () => undefined);
    await lookupsStarted;
    releaseLookups?.();

    const [first, second] = await Promise.all([firstSubscription, secondSubscription]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(allSubscribersLeftSpy).toHaveBeenCalledTimes(1);
    expect(eventTransport.getSubscriberCount('stream-lazy-concurrent')).toBe(2);

    first?.unsubscribe();
    second?.unsubscribe();
    await manager.destroy();
  });

  it('does not attach a subscription to a runtime replaced during the job lookup', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    const oldJob = await manager.createJob('stream-runtime-replaced', 'user-1', 'conversation-1');

    const originalGetJob = jobStore.getJob.bind(jobStore);
    let signalLookupStarted: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      signalLookupStarted = resolve;
    });
    let releaseLookup: (() => void) | undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    jest
      .spyOn(jobStore, 'getJob')
      .mockImplementation(originalGetJob)
      .mockImplementationOnce(async (...args) => {
        const job = await originalGetJob(...args);
        signalLookupStarted?.();
        await lookupGate;
        return job;
      });

    const staleSubscription = manager.subscribe('stream-runtime-replaced', () => undefined);
    await lookupStarted;
    now.mockReturnValue(2000);
    const replacementJob = await manager.createJob(
      'stream-runtime-replaced',
      'user-1',
      'conversation-1',
    );
    now.mockRestore();
    releaseLookup?.();

    await expect(staleSubscription).resolves.toBeNull();
    expect(oldJob.abortController.signal.aborted).toBe(true);
    expect(replacementJob.abortController.signal.aborted).toBe(false);
    expect(eventTransport.getSubscriberCount('stream-runtime-replaced')).toBe(0);

    const currentSubscription = await manager.subscribe('stream-runtime-replaced', () => undefined);
    expect(currentSubscription).not.toBeNull();

    currentSubscription?.unsubscribe();
    await manager.destroy();
  });

  it('does not return a lazy runtime replaced while its abort listener activates', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    let signalAbortRegistrationStarted: (() => void) | undefined;
    const abortRegistrationStarted = new Promise<void>((resolve) => {
      signalAbortRegistrationStarted = resolve;
    });
    let releaseAbortRegistration: (() => void) | undefined;
    const abortRegistrationGate = new Promise<void>((resolve) => {
      releaseAbortRegistration = resolve;
    });
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest
        .fn()
        .mockImplementationOnce(async () => {
          signalAbortRegistrationStarted?.();
          await abortRegistrationGate;
        })
        .mockResolvedValue(undefined),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();

    try {
      await jobStore.createJob('stream-lazy-abort-race', 'user-1');
      const staleLookup = manager.getJob('stream-lazy-abort-race');
      await abortRegistrationStarted;

      now.mockReturnValue(2000);
      const replacement = await jobStore.createJob('stream-lazy-abort-race', 'user-1');
      releaseAbortRegistration?.();

      await expect(staleLookup).resolves.toBeUndefined();
      await expect(manager.getJob('stream-lazy-abort-race')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
      });
      expect(eventTransport.onAbort).toHaveBeenCalledTimes(2);
    } finally {
      releaseAbortRegistration?.();
      now.mockRestore();
      await manager.destroy();
    }
  });

  it('keeps a replacement generation intact when its predecessor completes late', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();

    try {
      const predecessor = await manager.createJob('stream-late-complete', 'user-1');
      now.mockReturnValue(2000);
      const replacement = await manager.createJob('stream-late-complete', 'user-1');
      const replacementDone = jest.fn();
      const subscription = await manager.subscribe(
        'stream-late-complete',
        () => undefined,
        replacementDone,
      );
      const staleFinal: ServerSentEvent = {
        final: true,
        responseMessage: { text: 'stale' },
      };

      await manager.emitDone('stream-late-complete', staleFinal, predecessor.createdAt);
      await manager.completeJob('stream-late-complete', undefined, predecessor.createdAt);

      await expect(jobStore.getJob('stream-late-complete')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'running',
      });
      expect((await jobStore.getJob('stream-late-complete'))?.finalEvent).toBeUndefined();
      expect(replacement.abortController.signal.aborted).toBe(false);
      expect(replacementDone).not.toHaveBeenCalled();

      subscription?.unsubscribe();
    } finally {
      now.mockRestore();
      await manager.destroy();
    }
  });

  it('does not abort a replacement installed while an abort lookup is pending', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const abortDisposers: jest.Mock[] = [];
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => {
        const dispose = jest.fn();
        abortDisposers.push(dispose);
        return dispose;
      }),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();

    let signalLookupStarted: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      signalLookupStarted = resolve;
    });
    let releaseLookup: (() => void) | undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });

    try {
      const predecessor = await manager.createJob('stream-abort-lookup-race', 'user-1');
      await jobStore.deleteJob('stream-abort-lookup-race', predecessor.createdAt);
      jest.spyOn(jobStore, 'getJob').mockImplementationOnce(async () => {
        signalLookupStarted?.();
        await lookupGate;
        return null;
      });

      const aborting = manager.abortJob('stream-abort-lookup-race');
      await lookupStarted;
      const replacement = await manager.createJob('stream-abort-lookup-race', 'user-1');
      releaseLookup?.();

      await expect(aborting).resolves.toMatchObject({ success: false, jobData: null });
      expect(replacement.abortController.signal.aborted).toBe(false);
      expect(abortDisposers).toHaveLength(2);
      expect(abortDisposers[0]).toHaveBeenCalledTimes(1);
      expect(abortDisposers[1]).not.toHaveBeenCalled();
    } finally {
      releaseLookup?.();
      await manager.destroy();
    }
  });

  it('releases its exact runtime when completion loses to a terminal transition', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    const originalTransition = jobStore.transitionStatus.bind(jobStore);
    let signalTransitionStarted: (() => void) | undefined;
    const transitionStarted = new Promise<void>((resolve) => {
      signalTransitionStarted = resolve;
    });
    let releaseTransition: (() => void) | undefined;
    const transitionGate = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });

    try {
      const job = await manager.createJob('stream-complete-cas-loss', 'user-1');
      const subscription = await manager.subscribe('stream-complete-cas-loss', () => undefined);
      jest.spyOn(jobStore, 'transitionStatus').mockImplementationOnce(async (...args) => {
        signalTransitionStarted?.();
        await transitionGate;
        return originalTransition(...args);
      });

      const completing = manager.completeJob('stream-complete-cas-loss', undefined, job.createdAt);
      await transitionStarted;
      await originalTransition('stream-complete-cas-loss', {
        from: 'running',
        to: 'error',
        expectCreatedAt: job.createdAt,
        patch: { completedAt: Date.now(), error: 'competing terminal transition' },
      });
      releaseTransition?.();
      await completing;

      expect(job.abortController.signal.aborted).toBe(true);
      expect(abortDisposer).toHaveBeenCalledTimes(1);
      expect(eventTransport.getSubscriberCount('stream-complete-cas-loss')).toBe(1);
      expect(manager.getRuntimeStats().runtimeStateSize).toBe(1);
      subscription?.unsubscribe();
    } finally {
      releaseTransition?.();
      await manager.destroy();
    }
  });

  it('releases its exact runtime when abort loses to a terminal transition', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    const originalTransition = jobStore.transitionStatus.bind(jobStore);
    let signalTransitionStarted: (() => void) | undefined;
    const transitionStarted = new Promise<void>((resolve) => {
      signalTransitionStarted = resolve;
    });
    let releaseTransition: (() => void) | undefined;
    const transitionGate = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });

    try {
      const job = await manager.createJob('stream-abort-cas-loss', 'user-1');
      const subscription = await manager.subscribe('stream-abort-cas-loss', () => undefined);
      jest.spyOn(jobStore, 'transitionStatus').mockImplementationOnce(async (...args) => {
        signalTransitionStarted?.();
        await transitionGate;
        return originalTransition(...args);
      });

      const aborting = manager.abortJob('stream-abort-cas-loss');
      await transitionStarted;
      await originalTransition('stream-abort-cas-loss', {
        from: 'running',
        to: 'complete',
        expectCreatedAt: job.createdAt,
        patch: { completedAt: Date.now() },
      });
      releaseTransition?.();

      await expect(aborting).resolves.toMatchObject({ success: false, finalEvent: null });
      expect(job.abortController.signal.aborted).toBe(true);
      expect(abortDisposer).toHaveBeenCalledTimes(1);
      expect(eventTransport.getSubscriberCount('stream-abort-cas-loss')).toBe(1);
      expect(manager.getRuntimeStats().runtimeStateSize).toBe(1);
      subscription?.unsubscribe();
    } finally {
      releaseTransition?.();
      await manager.destroy();
    }
  });

  it('retains a same-epoch run that resumes while abort is claiming terminal state', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    const originalTransition = jobStore.transitionStatus.bind(jobStore);
    let signalAbortTransitionStarted: (() => void) | undefined;
    const abortTransitionStarted = new Promise<void>((resolve) => {
      signalAbortTransitionStarted = resolve;
    });
    let releaseAbortTransition: (() => void) | undefined;
    const abortTransitionGate = new Promise<void>((resolve) => {
      releaseAbortTransition = resolve;
    });
    let gateAbortTransition = true;
    jest.spyOn(jobStore, 'transitionStatus').mockImplementation(async (...args) => {
      if (gateAbortTransition && args[1].to === 'aborted') {
        gateAbortTransition = false;
        signalAbortTransitionStarted?.();
        await abortTransitionGate;
      }
      return originalTransition(...args);
    });

    try {
      const streamId = 'stream-abort-resume-race';
      const job = await manager.createJob(streamId, 'user-1');
      const pendingAction = createPendingAction(streamId);
      await expect(manager.approvals.pause(streamId, pendingAction)).resolves.toBe(true);

      const aborting = manager.abortJob(streamId);
      await abortTransitionStarted;
      await expect(manager.approvals.resolve(streamId, pendingAction.actionId)).resolves.toBe(true);
      releaseAbortTransition?.();

      await expect(aborting).resolves.toMatchObject({ success: false, finalEvent: null });
      expect(job.abortController.signal.aborted).toBe(false);
      expect(abortDisposer).not.toHaveBeenCalled();
      await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
        createdAt: job.createdAt,
        status: 'running',
      });

      manager.prepareForShutdown();
      await manager.destroy();
      await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
        createdAt: job.createdAt,
        status: 'error',
        error: 'Generation interrupted because its server shut down',
      });
    } finally {
      releaseAbortTransition?.();
      if (manager.getRuntimeStats().runtimeStateSize > 0) {
        await manager.destroy();
      }
    }
  });

  it('releases ownership but keeps the abort runtime when completion observes a pause', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    const streamId = 'stream-complete-paused';
    const job = await manager.createJob(streamId, 'user-1');
    await jobStore.transitionStatus(streamId, {
      from: 'running',
      to: 'requires_action',
      expectCreatedAt: job.createdAt,
    });

    await manager.completeJob(streamId, undefined, job.createdAt);

    expect(job.abortController.signal.aborted).toBe(false);
    expect(abortDisposer).not.toHaveBeenCalled();
    await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
      createdAt: job.createdAt,
      status: 'requires_action',
    });

    await jobStore.transitionStatus(streamId, {
      from: 'requires_action',
      to: 'running',
      expectCreatedAt: job.createdAt,
    });
    manager.prepareForShutdown();
    await manager.destroy();
    await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
      createdAt: job.createdAt,
      status: 'running',
    });
  });

  it('releases ownership when completion observes that its durable job is missing', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();

    try {
      const streamId = 'stream-complete-missing';
      const job = await manager.createJob(streamId, 'user-1');
      await jobStore.deleteJob(streamId, job.createdAt);

      await manager.completeJob(streamId, undefined, job.createdAt);

      expect(job.abortController.signal.aborted).toBe(true);
      expect(abortDisposer).toHaveBeenCalledTimes(1);
      const restored = await jobStore.createJob(streamId, 'user-1');
      expect(restored.createdAt).toBe(job.createdAt);

      manager.prepareForShutdown();
      await manager.destroy();
      await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
        createdAt: job.createdAt,
        status: 'running',
      });
    } finally {
      now.mockRestore();
      if (manager.getRuntimeStats().runtimeStateSize > 0) {
        await manager.destroy();
      }
    }
  });

  it('releases ownership when abort observes that its durable job is missing', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();

    try {
      const streamId = 'stream-abort-missing';
      const job = await manager.createJob(streamId, 'user-1');
      await jobStore.deleteJob(streamId, job.createdAt);

      await expect(manager.abortJob(streamId)).resolves.toMatchObject({
        success: false,
        jobData: null,
      });

      expect(job.abortController.signal.aborted).toBe(true);
      expect(abortDisposer).toHaveBeenCalledTimes(1);
      const restored = await jobStore.createJob(streamId, 'user-1');
      expect(restored.createdAt).toBe(job.createdAt);

      manager.prepareForShutdown();
      await manager.destroy();
      await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
        createdAt: job.createdAt,
        status: 'running',
      });
    } finally {
      now.mockRestore();
      if (manager.getRuntimeStats().runtimeStateSize > 0) {
        await manager.destroy();
      }
    }
  });

  it('releases ownership when abort observes an already-terminal durable job', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const abortDisposer = jest.fn();
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => abortDisposer),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    const streamId = 'stream-abort-terminal';
    const job = await manager.createJob(streamId, 'user-1');
    await jobStore.transitionStatus(streamId, {
      from: 'running',
      to: 'complete',
      expectCreatedAt: job.createdAt,
      patch: { completedAt: Date.now() },
    });

    await expect(manager.abortJob(streamId)).resolves.toMatchObject({
      success: false,
      jobData: expect.objectContaining({
        createdAt: job.createdAt,
        status: 'complete',
      }),
    });

    expect(job.abortController.signal.aborted).toBe(true);
    expect(abortDisposer).toHaveBeenCalledTimes(1);
    await jobStore.transitionStatus(streamId, {
      from: 'complete',
      to: 'running',
      expectCreatedAt: job.createdAt,
    });

    manager.prepareForShutdown();
    await manager.destroy();
    await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
      createdAt: job.createdAt,
      status: 'running',
    });
  });

  it('does not let a delayed predecessor metadata write contaminate a replacement', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalUpdateJob = jobStore.updateJob.bind(jobStore);
    let signalTitleWriteStarted: (() => void) | undefined;
    const titleWriteStarted = new Promise<void>((resolve) => {
      signalTitleWriteStarted = resolve;
    });
    let releaseTitleWrite: (() => void) | undefined;
    const titleWriteGate = new Promise<void>((resolve) => {
      releaseTitleWrite = resolve;
    });
    jest
      .spyOn(jobStore, 'updateJob')
      .mockImplementation(async (streamId, updates, expectedCreatedAt) => {
        if (updates.titleEvent) {
          signalTitleWriteStarted?.();
          await titleWriteGate;
        }
        return originalUpdateJob(streamId, updates, expectedCreatedAt);
      });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();

    try {
      await manager.createJob('stream-metadata-epoch', 'user-1');
      const emitting = manager.emitChunk('stream-metadata-epoch', {
        event: 'title',
        data: { title: 'stale title' },
      });
      await titleWriteStarted;
      now.mockReturnValue(2000);
      const replacement = await manager.createJob('stream-metadata-epoch', 'user-1');
      releaseTitleWrite?.();
      await emitting;

      await expect(jobStore.getJob('stream-metadata-epoch')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'running',
      });
      expect((await jobStore.getJob('stream-metadata-epoch'))?.titleEvent).toBeUndefined();
    } finally {
      releaseTitleWrite?.();
      now.mockRestore();
      await manager.destroy();
    }
  });

  it('does not let predecessor producers repopulate replacement volatile state', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();

    try {
      const predecessor = await manager.createJob('stream-volatile-epoch', 'user-1');
      now.mockReturnValue(2000);
      const replacement = await manager.createJob('stream-volatile-epoch', 'user-1');
      const staleContent: Parameters<typeof manager.setContentParts>[1] = [
        { type: 'text', text: 'predecessor' },
      ];
      const staleGraph = {
        contentData: [{ id: 'predecessor-step' }],
      };

      manager.setContentParts('stream-volatile-epoch', staleContent, predecessor.createdAt);
      manager.setCollectedUsage(
        'stream-volatile-epoch',
        [{ input_tokens: 10 }],
        predecessor.createdAt,
      );
      manager.setGraph('stream-volatile-epoch', staleGraph as never, predecessor.createdAt);

      await expect(jobStore.getContentParts('stream-volatile-epoch')).resolves.toBeNull();
      expect(jobStore.getCollectedUsage('stream-volatile-epoch')).toEqual([]);
      await expect(jobStore.getRunSteps('stream-volatile-epoch')).resolves.toEqual([]);

      const currentContent: Parameters<typeof manager.setContentParts>[1] = [
        { type: 'text', text: 'replacement' },
      ];
      const currentGraph = {
        contentData: [{ id: 'replacement-step' }],
      };
      manager.setContentParts('stream-volatile-epoch', currentContent, replacement.createdAt);
      manager.setCollectedUsage(
        'stream-volatile-epoch',
        [{ input_tokens: 20 }],
        replacement.createdAt,
      );
      manager.setGraph('stream-volatile-epoch', currentGraph as never, replacement.createdAt);

      await expect(jobStore.getContentParts('stream-volatile-epoch')).resolves.toEqual({
        content: currentContent,
      });
      expect(jobStore.getCollectedUsage('stream-volatile-epoch')).toEqual([{ input_tokens: 20 }]);
      await expect(jobStore.getRunSteps('stream-volatile-epoch')).resolves.toEqual(
        currentGraph.contentData,
      );
    } finally {
      now.mockRestore();
      await manager.destroy();
    }
  });

  it('reconciles a stale local runtime before delivering a replacement terminal event', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false, cleanupOnComplete: false });
    manager.initialize();

    try {
      const predecessor = await manager.createJob('stream-runtime-epoch', 'user-1');
      now.mockReturnValue(2000);
      const replacement = await jobStore.createJob('stream-runtime-epoch', 'user-1');
      const onDone = jest.fn();
      const subscription = await manager.subscribe('stream-runtime-epoch', () => undefined, onDone);
      const finalEvent: ServerSentEvent = {
        final: true,
        responseMessage: { text: 'replacement' },
      };

      eventTransport.emitDone('stream-runtime-epoch', finalEvent, replacement.createdAt);

      expect(subscription).not.toBeNull();
      expect(predecessor.abortController.signal.aborted).toBe(true);
      expect(onDone).toHaveBeenCalledWith(finalEvent);
      subscription?.unsubscribe();
    } finally {
      now.mockRestore();
      await manager.destroy();
    }
  });

  it('publishes a generation-scoped error when direct completion fails an active job', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    const job = await manager.createJob('stream-direct-error', 'user-1');
    const onError = jest.fn();
    const subscription = await manager.subscribe(
      'stream-direct-error',
      () => undefined,
      undefined,
      onError,
    );

    await manager.completeJob('stream-direct-error', 'initialization failed', job.createdAt);

    expect(onError).toHaveBeenCalledWith('initialization failed');
    await expect(jobStore.getJob('stream-direct-error')).resolves.toMatchObject({
      createdAt: job.createdAt,
      status: 'error',
      error: 'initialization failed',
    });
    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('finalizes the exact durable job when abort-listener setup fails before createJob returns', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn().mockRejectedValue(new Error('abort listener unavailable')),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();

    await expect(manager.createJob('stream-partial-create', 'user-1')).rejects.toThrow(
      'abort listener unavailable',
    );
    await expect(jobStore.getJob('stream-partial-create')).resolves.toMatchObject({
      status: 'error',
      error: 'abort listener unavailable',
    });

    await manager.destroy();
  });

  it('does not return a job replaced while its abort listener activates', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    let signalAbortRegistrationStarted: (() => void) | undefined;
    const abortRegistrationStarted = new Promise<void>((resolve) => {
      signalAbortRegistrationStarted = resolve;
    });
    let releaseAbortRegistration: (() => void) | undefined;
    const abortRegistrationGate = new Promise<void>((resolve) => {
      releaseAbortRegistration = resolve;
    });
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest
        .fn()
        .mockImplementationOnce(async () => {
          signalAbortRegistrationStarted?.();
          await abortRegistrationGate;
        })
        .mockResolvedValue(undefined),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();

    try {
      const predecessorCreation = manager.createJob('stream-create-replaced', 'user-1');
      await abortRegistrationStarted;
      const replacement = await manager.createJob('stream-create-replaced', 'user-1');
      releaseAbortRegistration?.();

      await expect(predecessorCreation).rejects.toThrow(
        'Generation job was replaced during initialization',
      );
      await expect(jobStore.getJob('stream-create-replaced')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'running',
      });
      expect(replacement.abortController.signal.aborted).toBe(false);
    } finally {
      releaseAbortRegistration?.();
      await manager.destroy();
    }
  });

  it('rechecks durable ownership after its abort listener activates', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    let signalAbortRegistrationStarted: (() => void) | undefined;
    const abortRegistrationStarted = new Promise<void>((resolve) => {
      signalAbortRegistrationStarted = resolve;
    });
    let releaseAbortRegistration: (() => void) | undefined;
    const abortRegistrationGate = new Promise<void>((resolve) => {
      releaseAbortRegistration = resolve;
    });
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => {
        signalAbortRegistrationStarted?.();
        await abortRegistrationGate;
      }),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();

    try {
      const predecessorCreation = manager.createJob('stream-remote-replacement', 'user-1');
      await abortRegistrationStarted;
      const replacement = await jobStore.createJob('stream-remote-replacement', 'user-1');
      releaseAbortRegistration?.();

      await expect(predecessorCreation).rejects.toThrow(
        'Generation job was replaced during initialization',
      );
      await expect(jobStore.getJob('stream-remote-replacement')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'running',
      });
      await expect(manager.getJob('stream-remote-replacement')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
      });
    } finally {
      releaseAbortRegistration?.();
      await manager.destroy();
    }
  });

  it('terminalizes a created epoch when shutdown starts during abort-listener readiness', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    let signalAbortRegistrationStarted: (() => void) | undefined;
    const abortRegistrationStarted = new Promise<void>((resolve) => {
      signalAbortRegistrationStarted = resolve;
    });
    let releaseAbortRegistration: (() => void) | undefined;
    const abortRegistrationGate = new Promise<void>((resolve) => {
      releaseAbortRegistration = resolve;
    });
    const eventTransport = Object.assign(new InMemoryEventTransport(), {
      onAbort: jest.fn(async () => {
        signalAbortRegistrationStarted?.();
        await abortRegistrationGate;
        return jest.fn();
      }),
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    const streamId = 'stream-create-shutdown-readiness';

    try {
      const creating = manager.createJob(streamId, 'user-1');
      await abortRegistrationStarted;
      manager.prepareForShutdown();
      releaseAbortRegistration?.();

      await expect(creating).rejects.toThrow('Generation job manager is shutting down');
      await manager.destroy();
      await expect(jobStore.getJob(streamId)).resolves.toMatchObject({
        status: 'error',
        error: 'Generation interrupted because its server shut down',
        completedAt: expect.any(Number),
      });
    } finally {
      releaseAbortRegistration?.();
      if (manager.getRuntimeStats().runtimeStateSize > 0) {
        await manager.destroy();
      }
    }
  });

  it('does not install a delayed older create over a completed replacement create', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const createJob = jobStore.createJob.bind(jobStore);
    let signalFirstDurableWrite: (() => void) | undefined;
    const firstDurableWrite = new Promise<void>((resolve) => {
      signalFirstDurableWrite = resolve;
    });
    let releaseFirstCreate: (() => void) | undefined;
    const firstCreateGate = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve;
    });
    let creationCount = 0;
    jest.spyOn(jobStore, 'createJob').mockImplementation(async (...args) => {
      const job = await createJob(...args);
      creationCount++;
      if (creationCount === 1) {
        signalFirstDurableWrite?.();
        await firstCreateGate;
      }
      return job;
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();

    try {
      const predecessorCreation = manager.createJob('stream-delayed-create', 'user-1');
      await firstDurableWrite;
      const replacement = await manager.createJob('stream-delayed-create', 'user-1');
      releaseFirstCreate?.();

      await expect(predecessorCreation).rejects.toThrow(
        'Generation job was replaced during initialization',
      );
      expect(replacement.abortController.signal.aborted).toBe(false);
      await expect(manager.getJob('stream-delayed-create')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
      });
      await expect(jobStore.getJob('stream-delayed-create')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'running',
      });

      manager.prepareForShutdown();
      await manager.destroy();
      await expect(jobStore.getJob('stream-delayed-create')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'error',
      });
    } finally {
      releaseFirstCreate?.();
      if (manager.getRuntimeStats().runtimeStateSize > 0) {
        await manager.destroy();
      }
    }
  });

  it('closes local subscribers before drain without broadcasting an abort', async () => {
    const manager = createManager();
    const telemetry = createTelemetry();
    const job = await manager.createJob('stream-6', 'user-1', 'conversation-6', {
      startupTelemetry: telemetry,
    });
    const onError = jest.fn();
    const subscription = await manager.subscribe('stream-6', () => undefined, undefined, onError);

    manager.prepareForShutdown();

    expect(onError).toHaveBeenCalledWith('Server is shutting down');
    expect(telemetry.end).toHaveBeenCalledWith('aborted');
    expect(job.abortController.signal.aborted).toBe(false);
    await expect(manager.createJob('stream-after-shutdown', 'user-1')).rejects.toThrow(
      'Generation job manager is shutting down',
    );

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('durably finalizes locally owned running jobs after the HTTP drain', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const eventTransport = new InMemoryEventTransport();
    const emitError = jest.spyOn(eventTransport, 'emitError');
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
    });
    manager.initialize();
    const job = await manager.createJob('stream-shutdown-owned', 'user-1');

    manager.prepareForShutdown();
    await manager.destroy();

    await expect(jobStore.getJob('stream-shutdown-owned')).resolves.toMatchObject({
      status: 'error',
      error: 'Generation interrupted because its server shut down',
      completedAt: expect.any(Number),
    });
    expect(emitError).toHaveBeenCalledWith(
      'stream-shutdown-owned',
      'Generation interrupted because its server shut down',
      job.createdAt,
    );
  });

  it('persists a partial response before shutdown terminal cleanup without a local subscriber', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    const job = await manager.createJob('stream-shutdown-partial', 'user-1');
    const partial = [{ type: 'text', text: 'partial response' }];
    jest.spyOn(jobStore, 'getContentParts').mockResolvedValue({ content: partial });
    const persisted = jest.fn(async (parts) => {
      expect(parts).toEqual(partial);
      await expect(jobStore.getJob('stream-shutdown-partial')).resolves.toMatchObject({
        status: 'running',
      });
    });
    job.emitter.on('allSubscribersLeft', persisted);

    manager.prepareForShutdown();
    await manager.destroy();

    expect(persisted).toHaveBeenCalledTimes(1);
    await expect(jobStore.getJob('stream-shutdown-partial')).resolves.toMatchObject({
      status: 'error',
      error: 'Generation interrupted because its server shut down',
    });
  });

  it('does not let late success overwrite or delete a shutdown error', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const originalCloseAndDrain = jobStore.closeAndDrainSteers.bind(jobStore);
    let signalCompletionStarted: (() => void) | undefined;
    const completionStarted = new Promise<void>((resolve) => {
      signalCompletionStarted = resolve;
    });
    let releaseCompletion: (() => void) | undefined;
    const completionGate = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    jest.spyOn(jobStore, 'closeAndDrainSteers').mockImplementationOnce(async (...args) => {
      signalCompletionStarted?.();
      await completionGate;
      return originalCloseAndDrain(...args);
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    const job = await manager.createJob('stream-shutdown-wins', 'user-1');

    const completing = manager.completeJob('stream-shutdown-wins', undefined, job.createdAt);
    await completionStarted;
    manager.prepareForShutdown();
    await manager.destroy();
    releaseCompletion?.();
    await completing;

    await expect(jobStore.getJob('stream-shutdown-wins')).resolves.toMatchObject({
      createdAt: job.createdAt,
      status: 'error',
      error: 'Generation interrupted because its server shut down',
    });
  });

  it('parks accepted steers before shutdown terminal cleanup removes the queue', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    await manager.createJob('stream-shutdown-steer', 'user-1');
    await manager.steering.enqueue('stream-shutdown-steer', {
      steerId: 'steer-shutdown',
      text: 'keep this',
      userId: 'user-1',
      createdAt: Date.now(),
    });

    manager.prepareForShutdown();
    await manager.destroy();

    await expect(
      manager.steering.claim('stream-shutdown-steer', { userId: 'user-1' }),
    ).resolves.toEqual([expect.objectContaining({ steerId: 'steer-shutdown', text: 'keep this' })]);
  });

  it('does not finalize a running job owned by a different replica', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    await jobStore.createJob('stream-remote-owner', 'user-1');
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    const subscription = await manager.subscribe('stream-remote-owner', () => undefined);

    manager.prepareForShutdown();
    await manager.destroy();

    await expect(jobStore.getJob('stream-remote-owner')).resolves.toMatchObject({
      status: 'running',
    });
    subscription?.unsubscribe();
  });

  it('transfers shutdown ownership to the replica that resumes a paused job', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const owner = new GenerationJobManagerClass();
    const resumer = new GenerationJobManagerClass();
    owner.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    resumer.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });

    await owner.createJob('stream-owner-transfer', 'user-1');
    const pendingAction = createPendingAction('stream-owner-transfer');
    await expect(owner.approvals.pause('stream-owner-transfer', pendingAction)).resolves.toBe(true);
    await expect(
      resumer.approvals.resolve('stream-owner-transfer', pendingAction.actionId),
    ).resolves.toBe(true);

    await owner.destroy();
    await expect(jobStore.getJob('stream-owner-transfer')).resolves.toMatchObject({
      status: 'running',
    });

    await resumer.destroy();
    await expect(jobStore.getJob('stream-owner-transfer')).resolves.toMatchObject({
      status: 'error',
      error: 'Generation interrupted because its server shut down',
    });
  });

  it('rejects a job when shutdown starts while its store write is pending', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const originalCreateJob = jobStore.createJob.bind(jobStore);
    let releaseCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    jest.spyOn(jobStore, 'createJob').mockImplementation(async (...args) => {
      await createGate;
      return originalCreateJob(...args);
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();

    const creating = manager.createJob('stream-7', 'user-1', 'conversation-7');
    manager.prepareForShutdown();
    releaseCreate?.();

    await expect(creating).rejects.toThrow('Generation job manager is shutting down');
    await manager.destroy();
    await expect(jobStore.getJob('stream-7')).resolves.toMatchObject({
      status: 'error',
      error: 'Generation interrupted because its server shut down',
    });
  });

  it('does not attach a subscriber when shutdown starts during the job lookup', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    await manager.createJob('stream-8', 'user-1', 'conversation-8');

    const originalGetJob = jobStore.getJob.bind(jobStore);
    let signalReadStarted: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    let releaseRead: (() => void) | undefined;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    jest.spyOn(jobStore, 'getJob').mockImplementation(async (...args) => {
      signalReadStarted?.();
      await readGate;
      return originalGetJob(...args);
    });

    const onError = jest.fn();
    const subscribing = manager.subscribe('stream-8', () => undefined, undefined, onError);
    await readStarted;
    manager.prepareForShutdown();
    releaseRead?.();

    await expect(subscribing).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith('Server is shutting down');
    expect(eventTransport.getSubscriberCount('stream-8')).toBe(0);
    await manager.destroy();
  });

  it('drains asynchronous disconnect handlers before destroying the job store', async () => {
    const manager = createManager();
    const job = await manager.createJob('stream-9', 'user-1', 'conversation-9');
    let signalHandlerStarted: (() => void) | undefined;
    const handlerStarted = new Promise<void>((resolve) => {
      signalHandlerStarted = resolve;
    });
    let releaseHandler: (() => void) | undefined;
    const handlerGate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    job.emitter.on('allSubscribersLeft', async () => {
      signalHandlerStarted?.();
      await handlerGate;
    });
    const subscription = await manager.subscribe('stream-9', () => undefined);

    manager.prepareForShutdown();
    await handlerStarted;

    let destroySettled = false;
    const destroying = manager.destroy().then(() => {
      destroySettled = true;
    });
    await Promise.resolve();

    expect(destroySettled).toBe(false);
    releaseHandler?.();
    await destroying;
    expect(destroySettled).toBe(true);
    subscription?.unsubscribe();
  });

  it('drains replaced services without destroying the newly configured services', async () => {
    const replacedJobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const replacedEventTransport = new InMemoryEventTransport();
    const replacedStoreDestroy = jest.spyOn(replacedJobStore, 'destroy');
    const replacedTransportDestroy = jest.spyOn(replacedEventTransport, 'destroy');
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: replacedJobStore,
      eventTransport: replacedEventTransport,
      isRedis: false,
    });
    manager.initialize();
    const job = await manager.createJob('stream-reconfigure-old', 'user-1');
    let signalCleanupStarted: (() => void) | undefined;
    const cleanupStarted = new Promise<void>((resolve) => {
      signalCleanupStarted = resolve;
    });
    let releaseCleanup: (() => void) | undefined;
    const cleanupGate = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    job.emitter.on('allSubscribersLeft', async () => {
      signalCleanupStarted?.();
      await cleanupGate;
    });
    const oldSubscription = await manager.subscribe('stream-reconfigure-old', () => undefined);
    oldSubscription?.unsubscribe();
    await cleanupStarted;

    const currentJobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const currentEventTransport = new InMemoryEventTransport();
    const currentStoreDestroy = jest.spyOn(currentJobStore, 'destroy');
    const currentTransportDestroy = jest.spyOn(currentEventTransport, 'destroy');
    manager.configure({
      jobStore: currentJobStore,
      eventTransport: currentEventTransport,
      isRedis: false,
    });
    manager.initialize();
    await manager.createJob('stream-reconfigure-current', 'user-1');

    expect(replacedTransportDestroy).toHaveBeenCalledTimes(1);
    expect(currentStoreDestroy).not.toHaveBeenCalled();
    expect(currentTransportDestroy).not.toHaveBeenCalled();

    releaseCleanup?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(replacedStoreDestroy).toHaveBeenCalledTimes(1);
    expect(currentStoreDestroy).not.toHaveBeenCalled();
    expect(currentTransportDestroy).not.toHaveBeenCalled();
    await expect(manager.hasJob('stream-reconfigure-current')).resolves.toBe(true);

    await manager.destroy();
    expect(currentStoreDestroy).toHaveBeenCalledTimes(1);
    expect(currentTransportDestroy).toHaveBeenCalledTimes(1);
  });

  it('does not deliver a stored terminal event after the subscriber detaches', async () => {
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    await manager.createJob('stream-10', 'user-1', 'conversation-10');
    const finalEvent: ServerSentEvent = {
      final: true,
      responseMessage: {
        messageId: 'response-10',
        content: [{ type: 'text', text: 'Complete response' }],
      },
    };
    await manager.emitDone('stream-10', finalEvent);
    await manager.completeJob('stream-10');

    const onDone = jest.fn();
    const subscription = await manager.subscribe('stream-10', () => undefined, onDone);
    subscription?.unsubscribe();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onDone).not.toHaveBeenCalled();
    await manager.destroy();
  });

  it('does not run partial-disconnect persistence after terminal delivery', async () => {
    const eventTransport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport,
      isRedis: false,
    });
    manager.initialize();
    const job = await manager.createJob('stream-terminal-disconnect', 'user-1');
    const onAllSubscribersLeft = jest.fn();
    job.emitter.on('allSubscribersLeft', onAllSubscribersLeft);
    const onDone = jest.fn();
    const subscription = await manager.subscribe(
      'stream-terminal-disconnect',
      () => undefined,
      onDone,
    );
    const finalEvent: ServerSentEvent = {
      final: true,
      responseMessage: {
        messageId: 'response-terminal',
        content: [{ type: 'text', text: 'Complete response' }],
      },
    };

    await manager.emitDone('stream-terminal-disconnect', finalEvent);
    await Promise.resolve();

    expect(onDone).toHaveBeenCalledWith(finalEvent);
    expect(onAllSubscribersLeft).not.toHaveBeenCalled();
    expect(eventTransport.getSubscriberCount('stream-terminal-disconnect')).toBe(0);

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('waits for transport readiness before scheduling a stored terminal event', async () => {
    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementation((streamId, handlers) => ({
      ...originalSubscribe(streamId, handlers),
      ready: readyGate,
    }));
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    await manager.createJob('stream-terminal-ready', 'user-1');
    const finalEvent: ServerSentEvent = {
      final: true,
      responseMessage: {
        messageId: 'response-ready',
        content: [{ type: 'text', text: 'Complete response' }],
      },
    };
    await manager.emitDone('stream-terminal-ready', finalEvent);
    await manager.completeJob('stream-terminal-ready');

    const onDone = jest.fn();
    let subscribeSettled = false;
    const subscribing = manager
      .subscribe('stream-terminal-ready', () => undefined, onDone)
      .then((result) => {
        subscribeSettled = true;
        return result;
      });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(subscribeSettled).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
    expect(eventTransport.getSubscriberCount('stream-terminal-ready')).toBe(1);

    releaseReady?.();
    const subscription = await subscribing;
    expect(onDone).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onDone).toHaveBeenCalledWith(finalEvent);
    expect(eventTransport.getSubscriberCount('stream-terminal-ready')).toBe(0);

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('refreshes terminal state that changes while the transport attaches', async () => {
    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementation((streamId, handlers) => ({
      ...originalSubscribe(streamId, handlers),
      ready: readyGate,
    }));
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    await manager.createJob('stream-terminal-race', 'user-1');
    const finalEvent: ServerSentEvent = {
      final: true,
      responseMessage: {
        messageId: 'response-race',
        content: [{ type: 'text', text: 'Complete response' }],
      },
    };
    const onDone = jest.fn();
    const subscribing = manager.subscribe('stream-terminal-race', () => undefined, onDone);
    await new Promise<void>((resolve) => setImmediate(resolve));

    await jobStore.updateJob('stream-terminal-race', {
      status: 'complete',
      completedAt: Date.now(),
      finalEvent: JSON.stringify(finalEvent),
    });
    releaseReady?.();
    const subscription = await subscribing;
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();

    expect(onDone).toHaveBeenCalledWith(finalEvent);
    expect(eventTransport.getSubscriberCount('stream-terminal-race')).toBe(0);

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('detaches the transport when subscription readiness rejects', async () => {
    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    jest.spyOn(eventTransport, 'subscribe').mockImplementation((streamId, handlers) => ({
      ...originalSubscribe(streamId, handlers),
      ready: Promise.reject(new Error('readiness failed')),
    }));
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport,
      isRedis: false,
      cleanupOnComplete: false,
    });
    manager.initialize();
    await manager.createJob('stream-terminal-reject', 'user-1');
    const finalEvent: ServerSentEvent = {
      final: true,
      responseMessage: {
        messageId: 'response-reject',
        content: [{ type: 'text', text: 'Complete response' }],
      },
    };
    await manager.emitDone('stream-terminal-reject', finalEvent);
    await manager.completeJob('stream-terminal-reject');
    const onDone = jest.fn();

    await expect(
      manager.subscribe('stream-terminal-reject', () => undefined, onDone),
    ).rejects.toThrow('readiness failed');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onDone).not.toHaveBeenCalled();
    expect(eventTransport.getSubscriberCount('stream-terminal-reject')).toBe(0);
    await manager.destroy();
  });

  it('does not duplicate an event already included by the in-memory resume snapshot', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalGetRunSteps = jobStore.getRunSteps.bind(jobStore);
    let signalSnapshotInProgress: (() => void) | undefined;
    const snapshotInProgress = new Promise<void>((resolve) => {
      signalSnapshotInProgress = resolve;
    });
    let releaseSnapshot: (() => void) | undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    jest.spyOn(jobStore, 'getRunSteps').mockImplementationOnce(async (...args) => {
      const runSteps = await originalGetRunSteps(...args);
      signalSnapshotInProgress?.();
      await snapshotGate;
      return runSteps;
    });

    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    await manager.createJob('stream-resume-snapshot', 'user-1');
    const contentParts: Parameters<typeof manager.setContentParts>[1] = [
      { type: 'text', text: 'before' },
    ];
    manager.setContentParts('stream-resume-snapshot', contentParts);

    const liveEvents: ServerSentEvent[] = [];
    const resuming = manager.subscribeWithResume('stream-resume-snapshot', (event) =>
      liveEvents.push(event),
    );
    await snapshotInProgress;

    const snapshotEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'during snapshot' }] } },
    };
    contentParts.push({ type: 'text', text: 'during snapshot' });
    await manager.emitChunk('stream-resume-snapshot', snapshotEvent);
    releaseSnapshot?.();

    const result = await resuming;
    expect(result.resumeState?.aggregatedContent).toEqual([
      { type: 'text', text: 'before' },
      { type: 'text', text: 'during snapshot' },
    ]);
    expect(result.pendingEvents).toEqual([]);
    result.subscription?.activate();
    expect(liveEvents).toEqual([]);

    result.subscription?.unsubscribe();
    await manager.destroy();
  });

  it('does not recapture an emission that started before the snapshot frontier', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalUpdateJob = jobStore.updateJob.bind(jobStore);
    let signalTitlePersisted: (() => void) | undefined;
    const titlePersisted = new Promise<void>((resolve) => {
      signalTitlePersisted = resolve;
    });
    let releaseTitleWrite: (() => void) | undefined;
    const titleWriteGate = new Promise<void>((resolve) => {
      releaseTitleWrite = resolve;
    });
    jest
      .spyOn(jobStore, 'updateJob')
      .mockImplementation(async (streamId, updates, expectedCreatedAt) => {
        await originalUpdateJob(streamId, updates, expectedCreatedAt);
        if (updates.titleEvent) {
          signalTitlePersisted?.();
          await titleWriteGate;
        }
      });

    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
    await manager.createJob('stream-resume-inflight', 'user-1');
    const titleEvent: ServerSentEvent = {
      event: 'title',
      data: { title: 'Snapshot title' },
    };
    const emitting = manager.emitChunk('stream-resume-inflight', titleEvent);
    await titlePersisted;

    const liveEvents: ServerSentEvent[] = [];
    const resuming = manager.subscribeWithResume('stream-resume-inflight', (event) =>
      liveEvents.push(event),
    );
    releaseTitleWrite?.();
    const result = await resuming;
    await emitting;

    expect(result.resumeState?.titleEvent).toEqual(titleEvent);
    expect(result.pendingEvents).toEqual([]);
    result.subscription?.activate();
    expect(liveEvents).toEqual([]);

    result.subscription?.unsubscribe();
    await manager.destroy();
  });

  it('preserves an in-memory resume event emitted after snapshot before transport readiness', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalGetContentParts = jobStore.getContentParts.bind(jobStore);
    let signalSnapshotTaken: (() => void) | undefined;
    const snapshotTaken = new Promise<void>((resolve) => {
      signalSnapshotTaken = resolve;
    });
    let releaseSnapshot: (() => void) | undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    jest.spyOn(jobStore, 'getContentParts').mockImplementationOnce(async (...args) => {
      const snapshot = await originalGetContentParts(...args);
      signalSnapshotTaken?.();
      await snapshotGate;
      return snapshot;
    });

    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    let signalTransportSubscribed: (() => void) | undefined;
    const transportSubscribed = new Promise<void>((resolve) => {
      signalTransportSubscribed = resolve;
    });
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementationOnce((streamId, handlers) => {
      const subscription = originalSubscribe(streamId, handlers);
      signalTransportSubscribed?.();
      return { ...subscription, ready: readyGate };
    });

    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    await manager.createJob('stream-resume-gap', 'user-1');

    const liveEvents: ServerSentEvent[] = [];
    const resuming = manager.subscribeWithResume('stream-resume-gap', (event) =>
      liveEvents.push(event),
    );
    await snapshotTaken;
    releaseSnapshot?.();
    await transportSubscribed;

    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-resume-gap', gapEvent);
    expect(liveEvents).toEqual([]);

    releaseReady?.();
    const result = await resuming;
    expect(result.pendingEvents).toEqual([gapEvent]);
    expect(liveEvents).toEqual([]);

    const deliveredEvents = [...result.pendingEvents];
    result.subscription?.activate();
    deliveredEvents.push(...liveEvents);
    expect(deliveredEvents).toEqual([gapEvent]);

    result.subscription?.unsubscribe();
    await manager.destroy();
  });

  it('captures the same in-memory gap independently for overlapping resume subscribers', async () => {
    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    let transportSubscriptions = 0;
    let signalBothTransportSubscribed: (() => void) | undefined;
    const bothTransportSubscribed = new Promise<void>((resolve) => {
      signalBothTransportSubscribed = resolve;
    });
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementation((streamId, handlers) => {
      const subscription = originalSubscribe(streamId, handlers);
      transportSubscriptions++;
      if (transportSubscriptions === 2) {
        signalBothTransportSubscribed?.();
      }
      return { ...subscription, ready: readyGate };
    });

    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport,
      isRedis: false,
    });
    manager.initialize();
    await manager.createJob('stream-overlapping-resumes', 'user-1');

    let snapshotsStarted = 0;
    let signalSnapshotsStarted: (() => void) | undefined;
    const bothSnapshotsStarted = new Promise<void>((resolve) => {
      signalSnapshotsStarted = resolve;
    });
    let releaseSnapshots: (() => void) | undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshots = resolve;
    });
    jest.spyOn(manager, 'getResumeState').mockImplementation(async () => {
      snapshotsStarted++;
      if (snapshotsStarted === 2) {
        signalSnapshotsStarted?.();
      }
      await snapshotGate;
      return { runSteps: [], aggregatedContent: [] };
    });

    const firstLiveEvents: ServerSentEvent[] = [];
    const secondLiveEvents: ServerSentEvent[] = [];
    const firstResume = manager.subscribeWithResume('stream-overlapping-resumes', (event) =>
      firstLiveEvents.push(event),
    );
    const secondResume = manager.subscribeWithResume('stream-overlapping-resumes', (event) =>
      secondLiveEvents.push(event),
    );
    await bothSnapshotsStarted;
    releaseSnapshots?.();
    await bothTransportSubscribed;

    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-overlapping-resumes', gapEvent);
    releaseReady?.();

    const [firstResult, secondResult] = await Promise.all([firstResume, secondResume]);
    expect(firstResult.pendingEvents).toEqual([gapEvent]);
    expect(secondResult.pendingEvents).toEqual([gapEvent]);

    const liveEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'live' }] } },
    };
    await manager.emitChunk('stream-overlapping-resumes', liveEvent);
    expect(firstLiveEvents).toEqual([]);
    expect(secondLiveEvents).toEqual([]);

    firstResult.subscription?.activate();
    expect(firstLiveEvents).toEqual([liveEvent]);
    expect(secondLiveEvents).toEqual([]);
    secondResult.subscription?.activate();
    expect(secondLiveEvents).toEqual([liveEvent]);

    firstResult.subscription?.unsubscribe();
    secondResult.subscription?.unsubscribe();
    await manager.destroy();
  });

  it('restores in-memory gap events when a resume attachment is canceled', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalGetContentParts = jobStore.getContentParts.bind(jobStore);
    let signalSnapshotTaken: (() => void) | undefined;
    const snapshotTaken = new Promise<void>((resolve) => {
      signalSnapshotTaken = resolve;
    });
    let releaseSnapshot: (() => void) | undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    jest.spyOn(jobStore, 'getContentParts').mockImplementationOnce(async (...args) => {
      const snapshot = await originalGetContentParts(...args);
      signalSnapshotTaken?.();
      await snapshotGate;
      return snapshot;
    });

    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    let signalTransportSubscribed: (() => void) | undefined;
    const transportSubscribed = new Promise<void>((resolve) => {
      signalTransportSubscribed = resolve;
    });
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementationOnce((streamId, handlers) => {
      const subscription = originalSubscribe(streamId, handlers);
      signalTransportSubscribed?.();
      return { ...subscription, ready: readyGate };
    });

    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    await manager.createJob('stream-resume-cancel', 'user-1');

    const attachmentAbortController = new AbortController();
    const resuming = manager.subscribeWithResume(
      'stream-resume-cancel',
      () => undefined,
      undefined,
      undefined,
      { signal: attachmentAbortController.signal },
    );
    await snapshotTaken;
    releaseSnapshot?.();
    await transportSubscribed;

    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-resume-cancel', gapEvent);

    attachmentAbortController.abort();
    await expect(resuming).resolves.toEqual(
      expect.objectContaining({ subscription: null, pendingEvents: [] }),
    );

    const replayed: ServerSentEvent[] = [];
    const subscription = await manager.subscribe('stream-resume-cancel', (event) =>
      replayed.push(event),
    );
    expect(replayed).toEqual([gapEvent]);

    releaseReady?.();
    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('restores gap events and detaches when resume reconciliation rejects', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const originalGetContentParts = jobStore.getContentParts.bind(jobStore);
    let signalSnapshotTaken: (() => void) | undefined;
    const snapshotTaken = new Promise<void>((resolve) => {
      signalSnapshotTaken = resolve;
    });
    let releaseSnapshot: (() => void) | undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    jest.spyOn(jobStore, 'getContentParts').mockImplementationOnce(async (...args) => {
      const snapshot = await originalGetContentParts(...args);
      signalSnapshotTaken?.();
      await snapshotGate;
      return snapshot;
    });
    const originalPeekSteers = jobStore.peekSteers.bind(jobStore);
    jest
      .spyOn(jobStore, 'peekSteers')
      .mockImplementationOnce(originalPeekSteers)
      .mockRejectedValueOnce(new Error('reconciliation failed'));

    const eventTransport = new InMemoryEventTransport();
    const originalSubscribe = eventTransport.subscribe.bind(eventTransport);
    let signalTransportSubscribed: (() => void) | undefined;
    const transportSubscribed = new Promise<void>((resolve) => {
      signalTransportSubscribed = resolve;
    });
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementationOnce((streamId, handlers) => {
      const subscription = originalSubscribe(streamId, handlers);
      signalTransportSubscribed?.();
      return { ...subscription, ready: readyGate };
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    await manager.createJob('stream-resume-reject', 'user-1');

    const resuming = manager.subscribeWithResume('stream-resume-reject', () => undefined);
    await snapshotTaken;
    releaseSnapshot?.();
    await transportSubscribed;

    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-resume-reject', gapEvent);
    releaseReady?.();

    await expect(resuming).rejects.toThrow('reconciliation failed');
    expect(eventTransport.getSubscriberCount('stream-resume-reject')).toBe(0);

    const replayed: ServerSentEvent[] = [];
    const subscription = await manager.subscribe('stream-resume-reject', (event) =>
      replayed.push(event),
    );
    expect(replayed).toEqual([gapEvent]);

    subscription?.unsubscribe();
    await manager.destroy();
  });
});
