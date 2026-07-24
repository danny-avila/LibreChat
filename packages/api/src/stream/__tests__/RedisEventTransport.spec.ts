import { logger } from '@librechat/data-schemas';
import type { Redis } from 'ioredis';
import { RedisEventTransport } from '~/stream/implementations/RedisEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { emitChunkWithReceipt } from '~/stream/internal/chunkPublication';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';
import { createMockPublisher } from './helpers/publisher';

logger.silent = true;

function createMockSubscriber() {
  return {
    on: jest.fn(),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
  };
}

function getMessageHandler(mockSubscriber: ReturnType<typeof createMockSubscriber>) {
  return mockSubscriber.on.mock.calls.find((call) => call[0] === 'message')?.[1] as (
    channel: string,
    message: string,
  ) => void;
}

interface SequencedTestMessage {
  type: 'chunk' | 'done' | 'error';
  seq: number;
  data?: object;
  error?: string;
}

function deliverSequencedMessage(
  handler: ReturnType<typeof getMessageHandler>,
  streamId: string,
  message: SequencedTestMessage,
): void {
  handler(`stream:{${streamId}}:events`, JSON.stringify(message));
}

describe('RedisEventTransport', () => {
  it('defers ordered delivery until the replay frontier is synchronized', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'deferred-until-sync';
    const received: object[] = [];
    const subscription = transport.subscribe(
      streamId,
      { onChunk: (event) => received.push(event as object) },
      { deferDeliveryUntilSynchronized: true },
    );

    deliverSequencedMessage(getMessageHandler(mockSubscriber), streamId, {
      type: 'chunk',
      seq: 0,
      data: { index: 0 },
    });

    expect(received).toEqual([]);

    await transport.syncReorderBuffer(streamId);

    expect(received).toEqual([{ index: 0 }]);

    subscription.unsubscribe();
    transport.destroy();
  });

  it('keeps the attachment fence closed across reorder timeout and buffer pressure', async () => {
    jest.useFakeTimers();
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'deferred-timeout-and-overflow';
    const received: object[] = [];
    const subscription = transport.subscribe(
      streamId,
      { onChunk: (event) => received.push(event as object) },
      { deferDeliveryUntilSynchronized: true },
    );
    const messageHandler = getMessageHandler(mockSubscriber);

    try {
      deliverSequencedMessage(messageHandler, streamId, {
        type: 'chunk',
        seq: 0,
        data: { index: 0 },
      });
      await jest.advanceTimersByTimeAsync(501);
      expect(received).toEqual([]);

      for (let i = 1; i < 100; i++) {
        deliverSequencedMessage(messageHandler, streamId, {
          type: 'chunk',
          seq: i,
          data: { index: i },
        });
      }
      expect(received).toEqual([]);

      await transport.syncReorderBuffer(streamId);
      expect(received).toHaveLength(100);
      expect(received[0]).toEqual({ index: 0 });
      expect(received[99]).toEqual({ index: 99 });
    } finally {
      subscription.unsubscribe();
      transport.destroy();
      jest.useRealTimers();
    }
  });

  it('waits at a same-replica frontier when the following sequence arrives first', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'same-replica-frontier-gap';
    const received: object[] = [];
    const subscription = transport.subscribe(
      streamId,
      { onChunk: (event) => received.push(event as object) },
      { deferDeliveryUntilSynchronized: true },
    );
    const messageHandler = getMessageHandler(mockSubscriber);
    mockPublisher.get.mockResolvedValueOnce('7');

    deliverSequencedMessage(messageHandler, streamId, {
      type: 'chunk',
      seq: 6,
      data: { index: 6 },
    });
    await transport.syncReorderBuffer(streamId, 5);

    expect(mockPublisher.get).toHaveBeenCalledWith(`stream:{${streamId}}:seq`);
    expect(received).toEqual([]);

    deliverSequencedMessage(messageHandler, streamId, {
      type: 'chunk',
      seq: 5,
      data: { index: 5 },
    });

    expect(received).toEqual([{ index: 5 }, { index: 6 }]);

    subscription.unsubscribe();
    transport.destroy();
  });

  it('uses the Redis sequence as the cross-replica attachment fence', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'cross-replica-attachment-fence';
    const received: object[] = [];
    const subscription = transport.subscribe(
      streamId,
      { onChunk: (event) => received.push(event as object) },
      { deferDeliveryUntilSynchronized: true },
    );
    const messageHandler = getMessageHandler(mockSubscriber);
    mockPublisher.get.mockResolvedValueOnce('7');

    try {
      deliverSequencedMessage(messageHandler, streamId, {
        type: 'chunk',
        seq: 6,
        data: { index: 6 },
      });
      await transport.syncReorderBuffer(streamId);

      expect(mockPublisher.get).toHaveBeenCalledWith(`stream:{${streamId}}:seq`);
      expect(received).toEqual([{ index: 6 }]);

      deliverSequencedMessage(messageHandler, streamId, {
        type: 'chunk',
        seq: 7,
        data: { index: 7 },
      });
      deliverSequencedMessage(messageHandler, streamId, {
        type: 'chunk',
        seq: 5,
        data: { index: 5 },
      });

      expect(received).toEqual([{ index: 6 }, { index: 7 }]);
    } finally {
      subscription.unsubscribe();
      transport.destroy();
    }
  });

  it('adopts the Redis frontier after an empty cross-replica sync', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'cross-replica-empty-sync';
    const received: object[] = [];
    const subscription = transport.subscribe(
      streamId,
      { onChunk: (event) => received.push(event as object) },
      { deferDeliveryUntilSynchronized: true },
    );
    mockPublisher.get.mockResolvedValueOnce('6');
    await transport.syncReorderBuffer(streamId);
    expect(mockPublisher.get).toHaveBeenCalledWith(`stream:{${streamId}}:seq`);

    deliverSequencedMessage(getMessageHandler(mockSubscriber), streamId, {
      type: 'chunk',
      seq: 6,
      data: { index: 6 },
    });
    expect(received).toEqual([{ index: 6 }]);

    deliverSequencedMessage(getMessageHandler(mockSubscriber), streamId, {
      type: 'chunk',
      seq: 7,
      data: { index: 7 },
    });
    expect(received).toEqual([{ index: 6 }, { index: 7 }]);

    subscription.unsubscribe();
    transport.destroy();
  });

  it('holds terminal events behind earlier chunks until synchronization', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'terminal-deferred-until-sync';
    const received: string[] = [];
    const subscription = transport.subscribe(
      streamId,
      {
        onChunk: (event) => received.push(`chunk:${(event as { index: number }).index}`),
        onDone: () => received.push('done'),
      },
      { deferDeliveryUntilSynchronized: true },
    );
    const messageHandler = getMessageHandler(mockSubscriber);

    deliverSequencedMessage(messageHandler, streamId, {
      type: 'done',
      seq: 1,
      data: { final: true },
    });
    deliverSequencedMessage(messageHandler, streamId, {
      type: 'chunk',
      seq: 0,
      data: { index: 0 },
    });

    expect(received).toEqual([]);

    await transport.syncReorderBuffer(streamId);

    expect(mockPublisher.get).toHaveBeenCalledWith(`stream:{${streamId}}:seq`);
    expect(received).toEqual(['chunk:0', 'done']);

    subscription.unsubscribe();
    transport.destroy();
  });

  it('closes a snapshot of local subscribers without publishing', () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'close-local-subscribers';
    const secondOnError = jest.fn();
    const onAllSubscribersLeft = jest.fn();
    transport.onAllSubscribersLeft(streamId, onAllSubscribersLeft);
    let unsubscribeSecond = (): void => undefined;
    const firstSubscription = transport.subscribe(streamId, {
      onChunk: () => undefined,
      onError: () => {
        unsubscribeSecond();
        throw new Error('first handler failed');
      },
    });
    const secondSubscription = transport.subscribe(streamId, {
      onChunk: () => undefined,
      onError: secondOnError,
    });
    unsubscribeSecond = secondSubscription.unsubscribe;

    expect(() => transport.closeLocalSubscribers(streamId, 'stream closed')).not.toThrow();
    expect(secondOnError).toHaveBeenCalledWith('stream closed');
    expect(transport.getSubscriberCount(streamId)).toBe(0);
    expect(onAllSubscribersLeft).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publish).not.toHaveBeenCalled();
    expect(mockPublisher.eval).not.toHaveBeenCalled();

    firstSubscription.unsubscribe();
    transport.destroy();
  });

  it('replaces the disconnect lifecycle callback for a replacement runtime', () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'replacement-disconnect-callback';
    const replacedRuntimeCallback = jest.fn();
    const currentRuntimeCallback = jest.fn();
    transport.onAllSubscribersLeft(streamId, replacedRuntimeCallback);
    transport.onAllSubscribersLeft(streamId, currentRuntimeCallback);
    const subscription = transport.subscribe(streamId, {
      onChunk: () => undefined,
    });

    subscription.unsubscribe();

    expect(replacedRuntimeCallback).not.toHaveBeenCalled();
    expect(currentRuntimeCallback).toHaveBeenCalledTimes(1);
    transport.destroy();
  });

  it('waits for the cross-replica abort channel before resolving job creation', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    let signalSubscriptionStarted: (() => void) | undefined;
    const subscriptionStarted = new Promise<void>((resolve) => {
      signalSubscriptionStarted = resolve;
    });
    let releaseSubscription: (() => void) | undefined;
    const subscriptionGate = new Promise<void>((resolve) => {
      releaseSubscription = resolve;
    });
    mockSubscriber.subscribe.mockImplementationOnce(() => {
      signalSubscriptionStarted?.();
      return subscriptionGate;
    });
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: transport,
      isRedis: true,
    });

    let createResolved = false;
    const creating = manager.createJob('abort-readiness', 'user-1').then((job) => {
      createResolved = true;
      return job;
    });

    await subscriptionStarted;
    await Promise.resolve();

    expect(createResolved).toBe(false);

    releaseSubscription?.();
    await creating;

    expect(createResolved).toBe(true);
    await manager.destroy();
  });

  it('keeps remote abort active after SSE disconnect until forced cleanup', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: transport,
      isRedis: true,
    });
    const streamId = 'remote-abort-after-disconnect';
    const job = await manager.createJob(streamId, 'user-1');
    const subscription = await manager.subscribe(streamId, () => undefined);

    subscription?.unsubscribe();

    expect(mockSubscriber.unsubscribe).not.toHaveBeenCalled();

    getMessageHandler(mockSubscriber)(
      `stream:{${streamId}}:events`,
      JSON.stringify({ type: 'abort' }),
    );

    expect(job.abortController.signal.aborted).toBe(true);

    transport.cleanup(streamId);
    expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(`stream:{${streamId}}:events`);

    await manager.destroy();
  });

  it('detaches a manager subscription when shutdown starts during transport readiness', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    let signalReadyStarted: (() => void) | undefined;
    const readyStarted = new Promise<void>((resolve) => {
      signalReadyStarted = resolve;
    });
    let releaseReady: (() => void) | undefined;
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    mockSubscriber.subscribe.mockImplementationOnce(() => {
      signalReadyStarted?.();
      return readyGate;
    });
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    Object.defineProperty(transport, 'onAbort', { value: undefined });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: transport,
      isRedis: true,
    });
    manager.initialize();
    await manager.createJob('shutdown-during-ready', 'user-1');

    const onError = jest.fn();
    const subscribing = manager.subscribe(
      'shutdown-during-ready',
      () => undefined,
      undefined,
      onError,
    );
    await readyStarted;

    manager.prepareForShutdown();

    expect(onError).toHaveBeenCalledWith('Server is shutting down');
    expect(transport.getSubscriberCount('shutdown-during-ready')).toBe(0);

    releaseReady?.();
    await expect(subscribing).resolves.toBeNull();
    await manager.destroy();
  });

  it('keeps publication receipts behind the internal transport capability', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );

    await expect(transport.emitChunk('stream-1', { text: 'Hello' })).resolves.toBeUndefined();
    await expect(emitChunkWithReceipt(transport, 'stream-1', { text: 'World' })).resolves.toBe(1);

    mockPublisher.eval.mockRejectedValue(new Error('publish failed'));
    await expect(transport.emitChunk('failed-stream', { text: 'Hello' })).resolves.toBeUndefined();
    await expect(emitChunkWithReceipt(transport, 'failed-stream', { text: 'Hello' })).resolves.toBe(
      false,
    );

    transport.destroy();
  });

  it('replays an event exactly once when its Redis publish resolves during attachment', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'publish-resolves-during-attachment';
    const messageHandler = getMessageHandler(mockSubscriber);
    mockPublisher.publish.mockImplementation(async (channel: string, payload: string) => {
      if (transport.getSubscriberCount(streamId) > 0) {
        messageHandler(channel, payload);
      }
      return 1;
    });

    const originalEval = mockPublisher.eval.getMockImplementation();
    let releasePublication: (() => void) | undefined;
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    mockPublisher.eval.mockImplementationOnce(async (...args: unknown[]) => {
      await publicationGate;
      return originalEval?.(...args);
    });

    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: transport,
      isRedis: true,
    });
    manager.initialize();
    await manager.createJob(streamId, 'user-1');

    const earlyEvent = {
      event: 'on_message_delta' as const,
      data: { delta: { content: { type: 'text', text: 'early' } } },
    };
    const publication = manager.emitChunk(streamId, earlyEvent);
    await Promise.resolve();

    const received: unknown[] = [];
    const attachment = manager.subscribe(streamId, (event) => received.push(event));
    let attachmentSettled = false;
    void attachment.then(() => {
      attachmentSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 550));

    expect(attachmentSettled).toBe(false);
    expect(received).toEqual([]);

    releasePublication?.();

    await publication;
    const subscription = await attachment;

    expect(received).toEqual([earlyEvent]);

    const liveEvent = {
      event: 'on_message_delta' as const,
      data: { delta: { content: { type: 'text', text: 'live' } } },
    };
    await manager.emitChunk(streamId, liveEvent);
    expect(received).toEqual([earlyEvent, liveEvent]);

    subscription?.unsubscribe();
    await manager.destroy();
  });

  it('hands a canceled resume bootstrap to a surviving initial subscriber', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'abort-during-publication-fence';
    const messageHandler = getMessageHandler(mockSubscriber);
    mockPublisher.publish.mockImplementation(async (channel: string, payload: string) => {
      messageHandler(channel, payload);
      return 1;
    });
    const originalEval = mockPublisher.eval.getMockImplementation();
    let signalPublicationStarted: (() => void) | undefined;
    const publicationStarted = new Promise<void>((resolve) => {
      signalPublicationStarted = resolve;
    });
    let releasePublication: (() => void) | undefined;
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    mockPublisher.eval.mockImplementationOnce(async (...args: unknown[]) => {
      signalPublicationStarted?.();
      await publicationGate;
      return originalEval?.(...args);
    });
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: transport,
      isRedis: true,
    });
    manager.initialize();
    await manager.createJob(streamId, 'user-1');

    const earlyEvent = {
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: 'early' }] } },
    } as const;
    const publication = manager.emitChunk(streamId, earlyEvent);
    await publicationStarted;

    const attachmentAbortController = new AbortController();
    const subscribing = manager.subscribe(streamId, () => undefined, undefined, undefined, {
      skipBufferReplay: true,
      signal: attachmentAbortController.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(transport.getSubscriberCount(streamId)).toBe(1);

    const receivedBySurvivor: unknown[] = [];
    const survivingSubscription = await manager.subscribe(streamId, (event) =>
      receivedBySurvivor.push(event),
    );
    expect(transport.getSubscriberCount(streamId)).toBe(2);

    attachmentAbortController.abort();

    await expect(subscribing).resolves.toBeNull();
    expect(transport.getSubscriberCount(streamId)).toBe(1);

    releasePublication?.();
    await publication;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(receivedBySurvivor).toEqual([earlyEvent]);

    const liveEvent = {
      event: 'on_message_delta' as const,
      data: { delta: { content: [{ type: 'text', text: 'live' }] } },
    };
    await manager.emitChunk(streamId, liveEvent);
    expect(receivedBySurvivor).toEqual([earlyEvent, liveEvent]);

    survivingSubscription?.unsubscribe();
    await manager.destroy();
  });

  it('deduplicates a cross-replica created fallback when the original publishes later', async () => {
    const mockPublisher = createMockPublisher();
    const generatingSubscriber = createMockSubscriber();
    const attachingSubscriber = createMockSubscriber();
    const generatingTransport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      generatingSubscriber as unknown as Redis,
    );
    const attachingTransport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      attachingSubscriber as unknown as Redis,
    );
    const attachingMessageHandler = getMessageHandler(attachingSubscriber);
    const streamId = 'cross-replica-created-fallback';
    mockPublisher.publish.mockImplementation(async (channel: string, payload: string) => {
      if (attachingTransport.getSubscriberCount(streamId) > 0) {
        attachingMessageHandler(channel, payload);
      }
      return 1;
    });

    const originalEval = mockPublisher.eval.getMockImplementation();
    let signalPublicationStarted: (() => void) | undefined;
    const publicationStarted = new Promise<void>((resolve) => {
      signalPublicationStarted = resolve;
    });
    let releasePublication: (() => void) | undefined;
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve;
    });
    mockPublisher.eval.mockImplementationOnce(async (...args: unknown[]) => {
      signalPublicationStarted?.();
      await publicationGate;
      return originalEval?.(...args);
    });

    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const generatingManager = new GenerationJobManagerClass();
    generatingManager.configure({
      jobStore,
      eventTransport: generatingTransport,
      isRedis: true,
    });
    const attachingManager = new GenerationJobManagerClass();
    attachingManager.configure({
      jobStore,
      eventTransport: attachingTransport,
      isRedis: true,
    });
    await generatingManager.createJob(streamId, 'user-1', streamId);

    const createdEvent = {
      created: true as const,
      message: {
        messageId: 'message-1',
        conversationId: streamId,
        text: 'Hello',
        sender: 'User',
        isCreatedByUser: true,
      },
      streamId,
    };
    const publication = generatingManager.emitChunk(streamId, createdEvent);
    await publicationStarted;

    const received: unknown[] = [];
    const subscription = await attachingManager.subscribe(streamId, (event) =>
      received.push(event),
    );
    expect(received).toEqual([createdEvent]);

    releasePublication?.();
    await publication;
    await Promise.resolve();

    expect(received).toEqual([createdEvent]);

    subscription?.unsubscribe();
    await generatingManager.destroy();
    await attachingManager.destroy();
  });

  it('reconstructs a missed cross-replica created event before a pending delta', async () => {
    const mockPublisher = createMockPublisher();
    const generatingSubscriber = createMockSubscriber();
    const attachingSubscriber = createMockSubscriber();
    const generatingTransport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      generatingSubscriber as unknown as Redis,
    );
    const attachingTransport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      attachingSubscriber as unknown as Redis,
    );
    const streamId = 'cross-replica-created-before-delta';
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 60_000 });
    const generatingManager = new GenerationJobManagerClass();
    generatingManager.configure({
      jobStore,
      eventTransport: generatingTransport,
      isRedis: true,
    });
    const attachingManager = new GenerationJobManagerClass();
    attachingManager.configure({
      jobStore,
      eventTransport: attachingTransport,
      isRedis: true,
    });
    await generatingManager.createJob(streamId, 'user-1', streamId);

    const createdEvent = {
      created: true as const,
      message: {
        messageId: 'message-1',
        conversationId: streamId,
        text: 'Hello',
        sender: 'User',
        isCreatedByUser: true,
      },
      streamId,
    };
    await generatingManager.emitChunk(streamId, createdEvent);

    const deltaEvent = {
      event: 'on_message_delta' as const,
      data: { delta: { content: [{ type: 'text', text: 'World' }] } },
    };
    const messageHandler = getMessageHandler(attachingSubscriber);
    const originalSync = attachingTransport.syncReorderBuffer.bind(attachingTransport);
    jest
      .spyOn(attachingTransport, 'syncReorderBuffer')
      .mockImplementation(async (syncStreamId, replayedSequenceFrontier) => {
        deliverSequencedMessage(messageHandler, streamId, {
          type: 'chunk',
          seq: 1,
          data: deltaEvent,
        });
        return originalSync(syncStreamId, replayedSequenceFrontier);
      });

    const received: unknown[] = [];
    const subscription = await attachingManager.subscribe(streamId, (event) =>
      received.push(event),
    );

    expect(received).toEqual([createdEvent, deltaEvent]);

    subscription?.unsubscribe();
    await generatingManager.destroy();
    await attachingManager.destroy();
  });

  it('keeps the replay frontier aligned after publication failure and reconnect', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );
    const streamId = 'buffered-publish-failure';
    const messageHandler = getMessageHandler(mockSubscriber);
    mockPublisher.publish.mockImplementation(async (channel: string, payload: string) => {
      if (transport.getSubscriberCount(streamId) > 0) {
        messageHandler(channel, payload);
      }
      return 1;
    });

    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
      eventTransport: transport,
      isRedis: true,
    });
    manager.initialize();

    await manager.createJob(streamId, 'user-1');
    mockPublisher.eval.mockRejectedValueOnce(
      new Error('publish failed before sequence allocation'),
    );

    await manager.emitChunk(streamId, {
      event: 'on_message_delta',
      data: { delta: { content: { type: 'text', text: 'buffered locally' } } },
    });

    const received: unknown[] = [];
    const subscription = await manager.subscribe(streamId, (event) => received.push(event));

    await manager.emitChunk(streamId, {
      event: 'on_message_delta',
      data: { delta: { content: { type: 'text', text: 'first live chunk' } } },
    });

    expect(received).toEqual([
      {
        event: 'on_message_delta',
        data: { delta: { content: { type: 'text', text: 'buffered locally' } } },
      },
      {
        event: 'on_message_delta',
        data: { delta: { content: { type: 'text', text: 'first live chunk' } } },
      },
    ]);

    subscription?.unsubscribe();

    await manager.emitChunk(streamId, {
      event: 'on_message_delta',
      data: { delta: { content: { type: 'text', text: 'buffered after disconnect' } } },
    });

    const resumed: unknown[] = [];
    const resumedSubscription = await manager.subscribe(streamId, (event) => resumed.push(event));
    await manager.emitChunk(streamId, {
      event: 'on_message_delta',
      data: { delta: { content: { type: 'text', text: 'live after reconnect' } } },
    });

    expect(resumed).toEqual([
      {
        event: 'on_message_delta',
        data: { delta: { content: { type: 'text', text: 'buffered after disconnect' } } },
      },
      {
        event: 'on_message_delta',
        data: { delta: { content: { type: 'text', text: 'live after reconnect' } } },
      },
    ]);

    resumedSubscription?.unsubscribe();
    await manager.destroy();
  });

  it('resets stale abort-listener reorder state before the next real subscriber', async () => {
    const mockPublisher = createMockPublisher();
    const mockSubscriber = createMockSubscriber();
    const transport = new RedisEventTransport(
      mockPublisher as unknown as Redis,
      mockSubscriber as unknown as Redis,
    );

    const streamId = 'reorder-abort-listener-reuse-test';
    transport.onAbort(streamId, () => {});

    const messageHandler = getMessageHandler(mockSubscriber);
    const channel = `stream:{${streamId}}:events`;

    for (let i = 0; i < 5; i++) {
      await transport.emitChunk(streamId, { index: i });
      messageHandler(channel, JSON.stringify({ type: 'chunk', seq: i, data: { index: i } }));
    }

    await mockPublisher.del(`stream:{${streamId}}:seq`);

    const secondRunChunks: unknown[] = [];
    transport.subscribe(streamId, {
      onChunk: (event) => secondRunChunks.push(event),
    });

    messageHandler(channel, JSON.stringify({ type: 'chunk', seq: 0, data: { index: 0 } }));

    expect(secondRunChunks.map((chunk) => (chunk as { index: number }).index)).toEqual([0]);

    transport.destroy();
  });
});
