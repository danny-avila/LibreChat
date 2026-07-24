import type { AgentStartupTelemetry } from '~/agents/startup';
import type { ServerSentEvent } from '~/types';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { registerChunkPublicationCapability } from '~/stream/internal/chunkPublication';
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

describe('GenerationJobManager startup telemetry', () => {
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
    await manager.createJob('stream-hot-path', 'user-1', 'conversation-1', {
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
    expect(publishWithReceipt).toHaveBeenCalledWith('stream-hot-path', firstDelta);
    expect(emitChunk).toHaveBeenCalledTimes(1);
    expect(emitChunk).toHaveBeenCalledWith('stream-hot-path', laterDelta);

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
    jest.spyOn(jobStore, 'updateJob').mockImplementation(async (streamId, updates) => {
      if (updates.createdEventEmitted === true) {
        signalCreatedWriteStarted?.();
        await createdWriteGate;
      }
      return originalUpdateJob(streamId, updates);
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
    const replacementJob = await manager.createJob(
      'stream-runtime-replaced',
      'user-1',
      'conversation-1',
    );
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

  it('rejects a job when shutdown starts while its store write is pending', async () => {
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
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
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: new InMemoryEventTransport(),
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

    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-overlapping-resumes', gapEvent);
    releaseSnapshots?.();

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
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    jest.spyOn(eventTransport, 'subscribe').mockImplementationOnce((streamId, handlers) => ({
      ...originalSubscribe(streamId, handlers),
      ready: readyGate,
    }));

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
    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-resume-cancel', gapEvent);
    releaseSnapshot?.();
    await new Promise<void>((resolve) => setImmediate(resolve));

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
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    await manager.createJob('stream-resume-reject', 'user-1');

    const resuming = manager.subscribeWithResume('stream-resume-reject', () => undefined);
    await snapshotTaken;
    const gapEvent: ServerSentEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'gap' }] } },
    };
    await manager.emitChunk('stream-resume-reject', gapEvent);
    releaseSnapshot?.();

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
