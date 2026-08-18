import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { createMethods, createModels, logger } from '@librechat/data-schemas';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import type {
  SubagentTaskRuntime,
  SubagentTaskStartRequest,
  SubagentTaskStartResult,
} from '@librechat/agents';
import type { AllMethods, IConversation, IMessage } from '@librechat/data-schemas';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import { buildSubagentThreadTaskConfig, SubagentThreadTaskStore } from './subagentThreads';
import { createSubagentAttemptKey } from './subagentThreadIds';
import { createSubagentUsageSink } from './usage';

let mongod: MongoMemoryServer;
let methods: AllMethods;
let loggerErrorSpy: jest.SpyInstance;

function taskRequest(
  scopeId: string,
  overrides: Partial<SubagentTaskStartRequest> = {},
): SubagentTaskStartRequest {
  const input = overrides.input ?? 'Investigate the issue.';
  return {
    scopeId,
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    parentRunId: overrides.parentRunId ?? randomUUID(),
    parentAgentId: overrides.parentAgentId ?? 'parent-agent',
    parentToolCallId: overrides.parentToolCallId ?? randomUUID(),
    ...(overrides.requestFingerprint == null
      ? {}
      : { requestFingerprint: overrides.requestFingerprint }),
    input,
    subagentKind: overrides.subagentKind ?? 'agent',
    subagentType: overrides.subagentType ?? 'researcher-agent',
    run:
      overrides.run ??
      (async (_runtime: SubagentTaskRuntime, initialMessages = []) => ({
        content: 'Completed the investigation.',
        messages: [
          ...initialMessages,
          new HumanMessage(input),
          new AIMessage('Completed the investigation.'),
        ],
      })),
    ...(overrides.threadId == null ? {} : { threadId: overrides.threadId }),
  };
}

async function waitForSettled(
  store: SubagentThreadTaskStore,
  scopeId: string,
  started: SubagentTaskStartResult,
): Promise<void> {
  const accepted = requireAccepted(started);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = store.get(scopeId, accepted.task.taskId);
    if (task != null && task.status !== 'running') {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the subagent task.');
}

function requireAccepted(
  started: SubagentTaskStartResult,
): Extract<SubagentTaskStartResult, { accepted: true }> {
  if (!started.accepted) {
    throw new Error('Expected the task to be accepted.');
  }
  return started;
}

function requireThreadId(started: SubagentTaskStartResult): string {
  const accepted = requireAccepted(started);
  if (!accepted.task.threadId) {
    throw new Error('Expected the accepted task to expose its durable thread id.');
  }
  return accepted.task.threadId;
}

async function saveParent(
  userId: string,
  conversationId: string,
  overrides: Record<string, unknown> = {},
): Promise<IConversation> {
  const saved = await methods.saveConvo(
    { userId },
    {
      conversationId,
      endpoint: EModelEndpoint.agents,
      title: 'Parent thread',
      agent_id: 'parent-agent',
      ...overrides,
    },
  );
  if (saved == null || 'message' in saved) {
    throw new Error('Failed to save parent conversation.');
  }
  return saved;
}

beforeAll(async () => {
  loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  mongod = await MongoMemoryServer.create();
  createModels(mongoose);
  methods = createMethods(mongoose);
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  loggerErrorSpy.mockRestore();
});

beforeEach(async () => {
  await Promise.all([
    (mongoose.models.Message as mongoose.Model<IMessage>).deleteMany({}),
    (mongoose.models.Conversation as mongoose.Model<IConversation>).deleteMany({}),
  ]);
});

describe('SubagentThreadTaskStore', () => {
  it('maps one logical SDK thread to a durable, view-only LibreChat conversation', async () => {
    const userId = 'user-1';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });

    const started = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, started);
    const threadId = requireThreadId(started);

    const conversation = await methods.getConvo(userId, threadId);
    expect(conversation).toMatchObject({
      conversationId: threadId,
      endpoint: EModelEndpoint.agents,
      agent_id: 'researcher-agent',
      subagentThread: {
        rootConversationId: parentConversationId,
        parentConversationId,
        parentAgentId: 'parent-agent',
        subagentType: 'researcher-agent',
        subagentKind: 'agent',
        depth: 1,
      },
    });
    expect(conversation?.subagentThread).not.toHaveProperty('userRunnable');
    const messages = await methods.getMessages(
      { user: userId, conversationId: threadId },
      '+subagentTranscript',
    );
    expect(messages.map((message) => message.text)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
    ]);
    expect(messages[1].subagentTranscript).toMatchObject({
      taskId: requireAccepted(started).task.taskId,
      mode: 'append',
    });
  });

  it('waits for initial parent persistence before creating the first child', async () => {
    const userId = 'parent-gate-user';
    const parentConversationId = randomUUID();
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    let releaseParent = (_value: unknown): void => undefined;
    const parentPersistence = new Promise<unknown>((resolve) => {
      releaseParent = resolve;
    });
    const run = jest.fn(taskRequest(config.scopeId).run);
    store.registerParentPersistence(config.scopeId, parentPersistence);

    const started = store.start(taskRequest(config.scopeId, { run }));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(run).not.toHaveBeenCalled();
    expect(await methods.getConvo(userId, requireThreadId(started))).toBeNull();

    await saveParent(userId, parentConversationId);
    releaseParent({
      message: { messageId: 'parent-message', conversationId: parentConversationId },
    });
    await waitForSettled(store, config.scopeId, started);

    expect(run).toHaveBeenCalledTimes(1);
    expect(await methods.getConvo(userId, requireThreadId(started))).not.toBeNull();
  });

  it('fails without leaving an orphan when parent persistence rejects', async () => {
    const userId = 'parent-gate-failure-user';
    const parentConversationId = randomUUID();
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(taskRequest(config.scopeId).run);
    store.registerParentPersistence(
      config.scopeId,
      Promise.reject(new Error('parent write failed')),
    );

    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    expect(run).not.toHaveBeenCalled();
    expect(await methods.getConvo(userId, requireThreadId(started))).toBeNull();
    expect(store.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('retains a resolved-but-unsaved parent failure until a valid write supersedes it', async () => {
    const userId = 'parent-empty-result-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const rejectedRun = jest.fn(taskRequest(config.scopeId).run);
    store.registerParentPersistence(config.scopeId, Promise.resolve({}));
    await new Promise<void>((resolve) => setImmediate(resolve));

    const rejected = store.start(taskRequest(config.scopeId, { run: rejectedRun }));
    await waitForSettled(store, config.scopeId, rejected);

    expect(rejectedRun).not.toHaveBeenCalled();
    expect(await methods.getConvo(userId, requireThreadId(rejected))).toBeNull();

    store.registerParentPersistence(
      config.scopeId,
      Promise.resolve({
        message: { messageId: 'next-parent-message', conversationId: parentConversationId },
      }),
    );
    const acceptedRun = jest.fn(taskRequest(config.scopeId).run);
    const accepted = store.start(taskRequest(config.scopeId, { run: acceptedRun }));
    await waitForSettled(store, config.scopeId, accepted);

    expect(acceptedRun).toHaveBeenCalledTimes(1);
  });

  it('continues with canonical transcript only and ignores non-canonical visible rows', async () => {
    const userId = 'canonical-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    const threadId = requireThreadId(first);

    const visibleUserId = randomUUID();
    await methods.saveMessage(
      { userId },
      {
        messageId: visibleUserId,
        conversationId: threadId,
        parentMessageId: `${requireAccepted(first).task.taskId}:assistant`,
        sender: 'User',
        text: 'A non-canonical human edit.',
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: true,
      },
    );
    await methods.saveMessage(
      { userId },
      {
        messageId: randomUUID(),
        conversationId: threadId,
        parentMessageId: visibleUserId,
        sender: 'Assistant',
        text: 'A non-canonical answer.',
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
      },
    );

    let restored: BaseMessage[] = [];
    const continued = store.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'Continue the investigation.',
        run: async (_runtime, initialMessages = []) => {
          restored = initialMessages;
          return {
            content: 'Continued.',
            messages: [
              ...initialMessages,
              new HumanMessage('Continue the investigation.'),
              new AIMessage('Continued.'),
            ],
          };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, continued);

    expect(restored.map((message) => message.content)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
    ]);
  });

  it('reuses the original task and thread for an idempotent replay', async () => {
    const userId = 'idempotent-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const request = taskRequest(config.scopeId, { idempotencyKey: 'same-attempt' });

    const first = store.start(request);
    const replay = store.start(request);

    expect(first.accepted).toBe(true);
    expect(replay).toMatchObject({
      accepted: true,
      isNew: false,
      task: requireAccepted(first).task,
    });
    await waitForSettled(store, config.scopeId, first);
    expect(
      (await methods.getMessages({ user: userId, conversationId: requireThreadId(first) })).length,
    ).toBe(2);
  });

  it('replays a completed attempt across API workers without executing or billing twice', async () => {
    const userId = 'durable-idempotency-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const firstWorker = new SubagentThreadTaskStore(methods);
    const secondWorker = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(firstWorker, { userId, parentConversationId });
    const firstRun = jest.fn(async () => ({
      content: 'Original durable result.',
      messages: [new HumanMessage('Run once.'), new AIMessage('Original durable result.')],
    }));
    const first = firstWorker.start(
      taskRequest(config.scopeId, {
        idempotencyKey: 'cross-worker-attempt',
        requestFingerprint: 'same-inputs',
        input: 'Run once.',
        run: firstRun,
      }),
    );
    await waitForSettled(firstWorker, config.scopeId, first);

    const replayRun = jest.fn(taskRequest(config.scopeId).run);
    const replay = secondWorker.start(
      taskRequest(config.scopeId, {
        idempotencyKey: 'cross-worker-attempt',
        requestFingerprint: 'same-inputs',
        input: 'Run once.',
        run: replayRun,
      }),
    );
    expect(requireThreadId(replay)).toBe(requireThreadId(first));
    await waitForSettled(secondWorker, config.scopeId, replay);

    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(replayRun).not.toHaveBeenCalled();
    expect(secondWorker.claim(config.scopeId, requireAccepted(replay).task.taskId)).toMatchObject({
      status: 'completed',
      result: 'Original durable result.',
    });
    expect(
      await methods.getMessages({ user: userId, conversationId: requireThreadId(first) }),
    ).toHaveLength(2);
  });

  it('rejects a conflicting durable retry across API workers', async () => {
    const userId = 'durable-conflict-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const firstWorker = new SubagentThreadTaskStore(methods);
    const secondWorker = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(firstWorker, { userId, parentConversationId });
    const first = firstWorker.start(
      taskRequest(config.scopeId, {
        idempotencyKey: 'reused-key',
        requestFingerprint: 'original-inputs',
      }),
    );
    await waitForSettled(firstWorker, config.scopeId, first);

    const conflictingRun = jest.fn(taskRequest(config.scopeId).run);
    const conflicting = secondWorker.start(
      taskRequest(config.scopeId, {
        idempotencyKey: 'reused-key',
        requestFingerprint: 'different-inputs',
        run: conflictingRun,
      }),
    );
    await waitForSettled(secondWorker, config.scopeId, conflicting);

    expect(conflictingRun).not.toHaveBeenCalled();
    expect(
      secondWorker.claim(config.scopeId, requireAccepted(conflicting).task.taskId),
    ).toMatchObject({ status: 'error' });
  });

  it('closes an abandoned durable attempt without re-executing it', async () => {
    const userId = 'abandoned-attempt-user';
    const parentConversationId = randomUUID();
    const threadId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    await methods.saveConvo(
      { userId },
      {
        conversationId: threadId,
        endpoint: EModelEndpoint.agents,
        title: 'Abandoned child',
        agent_id: 'researcher-agent',
        subagentThread: {
          rootConversationId: parentConversationId,
          parentConversationId,
          parentMessageId: 'parent-run',
          parentToolCallId: 'parent-tool',
          parentAgentId: 'parent-agent',
          subagentType: 'researcher-agent',
          subagentKind: 'agent',
          depth: 1,
        },
      },
    );
    await methods.saveMessage(
      { userId },
      {
        messageId: 'abandoned:user',
        conversationId: threadId,
        parentMessageId: String(Constants.NO_PARENT),
        sender: 'User',
        text: 'Run once.',
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: true,
        subagentTask: {
          attemptKey: createSubagentAttemptKey(config.scopeId, 'abandoned-attempt'),
          requestFingerprint: 'same-inputs',
          status: 'running',
        },
      },
    );
    const run = jest.fn(taskRequest(config.scopeId).run);
    const retry = store.start(
      taskRequest(config.scopeId, {
        threadId,
        idempotencyKey: 'abandoned-attempt',
        requestFingerprint: 'same-inputs',
        run,
      }),
    );
    await waitForSettled(store, config.scopeId, retry);

    expect(run).not.toHaveBeenCalled();
    expect(store.claim(config.scopeId, requireAccepted(retry).task.taskId)).toMatchObject({
      status: 'error',
      error:
        'Subagent task failed: The prior execution ended before its result could be persisted.',
    });
    const messages = await methods.getMessages(
      { user: userId, conversationId: threadId },
      '+subagentTask',
    );
    expect(messages.map((message) => message.subagentTask?.status)).toEqual(['running', 'error']);
  });

  it('holds one active lease per child and exposes provisional ownership safely', async () => {
    const userId = 'lease-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    let release = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const result = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      release = resolve;
    });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          markEntered();
          return result;
        },
      }),
    );
    const threadId = requireThreadId(started);

    expect(store.isThreadActiveForOwner(userId, threadId)).toBe(true);
    expect(store.isThreadActiveForOwner('different-user', threadId)).toBe(false);
    expect(store.isThreadActiveForOwner(userId, threadId, 'tenant-a')).toBe(false);
    await entered;
    expect(
      store.start(
        taskRequest(config.scopeId, {
          threadId,
          idempotencyKey: 'different-attempt',
        }),
      ),
    ).toEqual({ accepted: false, reason: 'capacity' });

    release({
      content: 'Lease completed.',
      messages: [new HumanMessage('Investigate the issue.'), new AIMessage('Lease completed.')],
    });
    await waitForSettled(store, config.scopeId, started);
    expect(store.isThreadActiveForOwner(userId, threadId)).toBe(false);
  });

  it('serializes continuations across independent API worker stores', async () => {
    const userId = 'cross-worker-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const firstWorker = new SubagentThreadTaskStore(methods);
    const secondWorker = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(firstWorker, { userId, parentConversationId });
    const initial = firstWorker.start(taskRequest(config.scopeId));
    await waitForSettled(firstWorker, config.scopeId, initial);
    const threadId = requireThreadId(initial);

    let releaseFirst = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    let markFirstEntered = (): void => undefined;
    const firstEntered = new Promise<void>((resolve) => {
      markFirstEntered = resolve;
    });
    const firstResult = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      releaseFirst = resolve;
    });
    const first = firstWorker.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'First continuation.',
        run: async () => {
          markFirstEntered();
          return firstResult;
        },
      }),
    );
    await firstEntered;

    const secondRun = jest.fn(taskRequest(config.scopeId).run);
    const second = secondWorker.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'Overlapping continuation.',
        run: secondRun,
      }),
    );
    await waitForSettled(secondWorker, config.scopeId, second);
    expect(secondRun).not.toHaveBeenCalled();
    expect(secondWorker.claim(config.scopeId, requireAccepted(second).task.taskId)).toMatchObject({
      status: 'error',
    });

    releaseFirst({
      content: 'First continuation completed.',
      messages: [new HumanMessage('First continuation.'), new AIMessage('Completed.')],
    });
    await waitForSettled(firstWorker, config.scopeId, first);
  });

  it('renews the shared lease while a continuation transcript is being prepared', async () => {
    const userId = 'slow-prepare-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let slowThreadId = '';
    let blockNextRead = false;
    let markPreparing = (): void => undefined;
    const preparing = new Promise<void>((resolve) => {
      markPreparing = resolve;
    });
    let releasePreparation = (): void => undefined;
    const preparationRelease = new Promise<void>((resolve) => {
      releasePreparation = resolve;
    });
    const slowMethods = {
      ...methods,
      getMessages: jest.fn(async (...args: Parameters<AllMethods['getMessages']>) => {
        if (blockNextRead && args[0].conversationId === slowThreadId) {
          blockNextRead = false;
          markPreparing();
          await preparationRelease;
        }
        return methods.getMessages(...args);
      }),
    };
    const options = { leaseTtlMs: 60, leaseHeartbeatMs: 10 };
    const firstWorker = new SubagentThreadTaskStore(slowMethods, options);
    const secondWorker = new SubagentThreadTaskStore(methods, options);
    const config = buildSubagentThreadTaskConfig(firstWorker, { userId, parentConversationId });
    const initial = firstWorker.start(taskRequest(config.scopeId));
    await waitForSettled(firstWorker, config.scopeId, initial);
    slowThreadId = requireThreadId(initial);
    blockNextRead = true;

    const firstRun = jest.fn(taskRequest(config.scopeId).run);
    const first = firstWorker.start(
      taskRequest(config.scopeId, {
        threadId: slowThreadId,
        idempotencyKey: 'slow-preparation',
        run: firstRun,
      }),
    );
    await preparing;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    const overlappingRun = jest.fn(taskRequest(config.scopeId).run);
    const overlapping = secondWorker.start(
      taskRequest(config.scopeId, {
        threadId: slowThreadId,
        idempotencyKey: 'overlapping-preparation',
        run: overlappingRun,
      }),
    );
    await waitForSettled(secondWorker, config.scopeId, overlapping);
    expect(overlappingRun).not.toHaveBeenCalled();

    releasePreparation();
    await waitForSettled(firstWorker, config.scopeId, first);
    expect(firstRun).toHaveBeenCalledTimes(1);
  });

  it('rechecks account deletion after acquiring the shared lease', async () => {
    const userId = 'lease-fence-gap-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let ownerActive = true;
    const fencedMethods = {
      ...methods,
      acquireSubagentThreadLease: jest.fn(
        async (...args: Parameters<AllMethods['acquireSubagentThreadLease']>) => {
          const acquired = await methods.acquireSubagentThreadLease(...args);
          ownerActive = false;
          return acquired;
        },
      ),
    };
    const store = new SubagentThreadTaskStore(fencedMethods, {
      isOwnerActive: async () => ownerActive,
    });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(taskRequest(config.scopeId).run);
    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    expect(run).not.toHaveBeenCalled();
    expect(await methods.getConvo(userId, requireThreadId(started))).toBeNull();
    expect(await methods.countActiveSubagentThreadLeases({ user: userId, now: new Date() })).toBe(
      0,
    );
  });

  it('lets account deletion on one worker drain a child running on another', async () => {
    const userId = 'owner-drain-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let ownerActive = true;
    const options = {
      isOwnerActive: async () => ownerActive,
      leaseTtlMs: 60,
      leaseHeartbeatMs: 10,
      ownerDrainTimeoutMs: 1_000,
      ownerDrainPollMs: 5,
    };
    const workerStore = new SubagentThreadTaskStore(methods, options);
    const deletingStore = new SubagentThreadTaskStore(methods, options);
    const config = buildSubagentThreadTaskConfig(workerStore, { userId, parentConversationId });
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const started = workerStore.start(
      taskRequest(config.scopeId, {
        run: async (runtime) => {
          markEntered();
          return new Promise((_resolve, reject) => {
            runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), {
              once: true,
            });
          });
        },
      }),
    );
    await entered;

    ownerActive = false;
    await deletingStore.cancelAndDrainForOwner(userId);
    await waitForSettled(workerStore, config.scopeId, started);

    expect(await methods.countActiveSubagentThreadLeases({ user: userId, now: new Date() })).toBe(
      0,
    );
    expect(workerStore.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'cancelled',
    });
  });

  it('fails account deletion closed while a cancelled provider still owns its lease', async () => {
    const userId = 'stubborn-provider-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let ownerActive = true;
    const options = {
      isOwnerActive: async () => ownerActive,
      leaseTtlMs: 1_000,
      leaseHeartbeatMs: 100,
      ownerDrainTimeoutMs: 1_500,
      ownerDrainPollMs: 20,
    };
    const workerStore = new SubagentThreadTaskStore(methods, options);
    const deletingStore = new SubagentThreadTaskStore(methods, options);
    const config = buildSubagentThreadTaskConfig(workerStore, { userId, parentConversationId });
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    let releaseProvider = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    const provider = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      releaseProvider = resolve;
    });
    const started = workerStore.start(
      taskRequest(config.scopeId, {
        run: async () => {
          markEntered();
          return provider;
        },
      }),
    );
    await entered;

    ownerActive = false;
    await expect(deletingStore.cancelAndDrainForOwner(userId)).rejects.toThrow(
      'Timed out draining detached subagent tasks',
    );
    expect(await methods.countActiveSubagentThreadLeases({ user: userId, now: new Date() })).toBe(
      1,
    );

    ownerActive = true;
    releaseProvider({ content: 'Stopped.', messages: [new AIMessage('Stopped.')] });
    await waitForSettled(workerStore, config.scopeId, started);
  });

  it('does not overwrite a child title changed while detached execution is running', async () => {
    const userId = 'title-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    let release = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const result = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      release = resolve;
    });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          markEntered();
          return result;
        },
      }),
    );
    await entered;
    await methods.saveConvo(
      { userId },
      { conversationId: requireThreadId(started), title: 'Renamed while running' },
      { noUpsert: true },
    );

    release({
      content: 'Renamed child completed.',
      messages: [
        new HumanMessage('Investigate the issue.'),
        new AIMessage('Renamed child completed.'),
      ],
    });
    await waitForSettled(store, config.scopeId, started);

    expect(await methods.getConvo(userId, requireThreadId(started))).toMatchObject({
      title: 'Renamed while running',
    });
  });

  it('lets deletion win over a concurrently settling detached result', async () => {
    const userId = 'deletion-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let deletedThreadId = '';
    const deletingMethods = {
      ...methods,
      saveMessage: jest.fn(async (...args: Parameters<AllMethods['saveMessage']>) => {
        const message = args[1];
        if (message.text === 'Result after deletion.') {
          deletedThreadId = message.conversationId ?? '';
          await methods.deleteConvos(userId, { conversationId: deletedThreadId });
        }
        return methods.saveMessage(...args);
      }),
    };
    const store = new SubagentThreadTaskStore(deletingMethods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => ({
          content: 'Result after deletion.',
          messages: [new AIMessage('Result after deletion.')],
        }),
      }),
    );
    await waitForSettled(store, config.scopeId, started);

    expect(deletedThreadId).toBe(requireThreadId(started));
    expect(await methods.getConvo(userId, deletedThreadId)).toBeNull();
    expect(await methods.getMessages({ user: userId, conversationId: deletedThreadId })).toEqual(
      [],
    );
    expect(store.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('bills detached usage independently and persists its rollup on the child result', async () => {
    const userId = 'usage-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const parentUsage: UsageMetadata[] = [];
    const recordDetachedUsage = jest.fn().mockResolvedValue(undefined);
    const sink = createSubagentUsageSink(
      parentUsage,
      (usage) => {
        usage.cost = 0.25;
      },
      recordDetachedUsage,
    );
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          await sink({
            usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
            model: 'gpt-5-mini',
            provider: 'openAI',
            subagentType: 'researcher-agent',
            subagentRunId: 'child-run',
            subagentAgentId: 'researcher-agent',
            runId: 'parent-run',
          });
          return {
            content: 'Usage recorded.',
            messages: [
              new HumanMessage('Investigate the issue.'),
              new AIMessage('Usage recorded.'),
            ],
          };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, started);

    expect(parentUsage).toEqual([]);
    expect(recordDetachedUsage).toHaveBeenCalledTimes(1);
    const messages = await methods.getMessages({
      user: userId,
      conversationId: requireThreadId(started),
    });
    expect(messages[messages.length - 1]?.metadata?.usage).toEqual({
      input: 100,
      output: 20,
      cacheWrite: 0,
      cacheRead: 0,
      cost: 0.25,
    });
  });

  it('persists graph children without assigning a saved-agent identity', async () => {
    const userId = 'graph-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        subagentKind: 'graph',
        subagentType: 'research-team',
      }),
    );
    await waitForSettled(store, config.scopeId, started);

    const conversation = await methods.getConvo(userId, requireThreadId(started));
    expect(conversation?.agent_id).toBeUndefined();
    expect(conversation?.subagentThread).toMatchObject({
      subagentKind: 'graph',
      subagentType: 'research-team',
    });
  });

  it('inherits tenant isolation and rejects a cross-tenant continuation', async () => {
    const userId = 'tenant-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId, { tenantId: 'tenant-a' });
    const store = new SubagentThreadTaskStore(methods);
    const tenantA = buildSubagentThreadTaskConfig(store, {
      userId,
      parentConversationId,
      tenantId: 'tenant-a',
    });
    const first = store.start(taskRequest(tenantA.scopeId));
    await waitForSettled(store, tenantA.scopeId, first);

    const tenantB = buildSubagentThreadTaskConfig(store, {
      userId,
      parentConversationId,
      tenantId: 'tenant-b',
    });
    const run = jest.fn(taskRequest(tenantB.scopeId).run);
    const crossTenant = store.start(
      taskRequest(tenantB.scopeId, { threadId: requireThreadId(first), run }),
    );
    await waitForSettled(store, tenantB.scopeId, crossTenant);

    expect(run).not.toHaveBeenCalled();
    expect(store.claim(tenantB.scopeId, requireAccepted(crossTenant).task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('removes a newly-created child when its first input cannot be persisted', async () => {
    const userId = 'rollback-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const failingMethods = {
      ...methods,
      saveMessage: jest.fn(async (...args: Parameters<AllMethods['saveMessage']>) => {
        if (args[1].isCreatedByUser === true) {
          return null;
        }
        return methods.saveMessage(...args);
      }),
    };
    const store = new SubagentThreadTaskStore(failingMethods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(taskRequest(config.scopeId).run);
    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    expect(run).not.toHaveBeenCalled();
    expect(await methods.getConvo(userId, requireThreadId(started))).toBeNull();
  });

  it('persists a compacted canonical replacement without replaying superseded history', async () => {
    const userId = 'compaction-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    const threadId = requireThreadId(first);

    const compactedMessages: BaseMessage[] = [
      new HumanMessage('Condensed prior work.'),
      new AIMessage('Compact state.'),
      new HumanMessage('Continue from the compact state.'),
      new AIMessage('Compacted continuation complete.'),
    ];
    const second = store.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'Continue from the compact state.',
        run: async () => ({
          content: 'Compacted continuation complete.',
          messages: compactedMessages,
        }),
      }),
    );
    await waitForSettled(store, config.scopeId, second);

    let restored: BaseMessage[] = [];
    const third = store.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'One more turn.',
        run: async (_runtime, initialMessages = []) => {
          restored = initialMessages;
          return { content: 'Done.', messages: [...initialMessages, new AIMessage('Done.')] };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, third);

    expect(restored.map((message) => message.content)).toEqual(
      compactedMessages.map((message) => message.content),
    );
    const messages = await methods.getMessages(
      { user: userId, conversationId: threadId },
      '+subagentTranscript',
    );
    expect(
      messages.find(
        (message) => message.messageId === `${requireAccepted(second).task.taskId}:assistant`,
      )?.subagentTranscript?.mode,
    ).toBe('replace');
  });

  it('holds the child lease through cancellation and discards a late success', async () => {
    const userId = 'cancel-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    const threadId = requireThreadId(first);

    let finishLate = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const lateResult = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      finishLate = resolve;
    });
    const cancelled = store.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'Long child turn.',
        run: async () => {
          markEntered();
          return lateResult;
        },
      }),
    );
    await entered;
    expect(
      store.control(config.scopeId, requireAccepted(cancelled).task.taskId, { action: 'cancel' })
        .status,
    ).toBe('cancelled');
    expect(
      store.start(
        taskRequest(config.scopeId, {
          threadId,
          input: 'Must not overlap.',
        }),
      ),
    ).toEqual({ accepted: false, reason: 'capacity' });

    finishLate({
      content: 'Late success must be discarded.',
      messages: [new AIMessage('Late success must be discarded.')],
    });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (!store.isThreadActiveForOwner(userId, threadId)) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      if (attempt === 199) {
        throw new Error('Cancelled child execution did not release its durable lease.');
      }
    }

    const messages = await methods.getMessages({ user: userId, conversationId: threadId });
    expect(messages.map((message) => message.text)).not.toContain(
      'Late success must be discarded.',
    );
    expect(messages.map((message) => message.text)).toContain('Subagent task was cancelled.');
  });

  it('cancels an active descendant and lets parent deletion remove its durable thread', async () => {
    const userId = 'parent-delete-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    let finishLate = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const lateResult = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      finishLate = resolve;
    });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          markEntered();
          return lateResult;
        },
      }),
    );
    await entered;
    const threadId = requireThreadId(started);

    expect(store.cancelForConversations(userId, [parentConversationId])).toBe(1);
    await methods.deleteConvos(userId, { conversationId: parentConversationId });
    finishLate({ content: 'Too late.', messages: [new AIMessage('Too late.')] });
    await waitForSettled(store, config.scopeId, started);

    expect(await methods.getConvo(userId, parentConversationId)).toBeNull();
    expect(await methods.getConvo(userId, threadId)).toBeNull();
    expect(await methods.getMessages({ user: userId, conversationId: threadId })).toEqual([]);
  });

  it('persists task timeouts as failures rather than cancellations', async () => {
    const userId = 'timeout-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods, { taskTimeoutMs: 20 });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        input: 'Run until timeout.',
        run: async (runtime) =>
          new Promise((_resolve, reject) => {
            runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), {
              once: true,
            });
          }),
      }),
    );
    await waitForSettled(store, config.scopeId, started);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (!store.isThreadActiveForOwner(userId, requireThreadId(started))) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      if (attempt === 199) {
        throw new Error('Timed-out child execution did not finish durable settlement.');
      }
    }

    expect(store.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'error',
      error: 'Detached subagent task timed out.',
    });
    const messages = await methods.getMessages({
      user: userId,
      conversationId: requireThreadId(started),
    });
    expect(messages.map((message) => message.text)).toContain(
      'Subagent task failed: The child run could not be completed.',
    );
    expect(messages.map((message) => message.text)).not.toContain('Subagent task was cancelled.');
  });

  it('lets durable settlement win once a successful commit has started', async () => {
    const userId = 'commit-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let markCommitStarted = (): void => undefined;
    let releaseCommit = (): void => undefined;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitRelease = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const blockingMethods = {
      ...methods,
      saveMessage: jest.fn(async (...args: Parameters<AllMethods['saveMessage']>) => {
        if (args[1].text === 'Committed result.') {
          markCommitStarted();
          await commitRelease;
        }
        return methods.saveMessage(...args);
      }),
    };
    const store = new SubagentThreadTaskStore(blockingMethods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => ({
          content: 'Committed result.',
          messages: [new AIMessage('Committed result.')],
        }),
      }),
    );
    await commitStarted;

    expect(
      store.control(config.scopeId, requireAccepted(started).task.taskId, { action: 'cancel' }),
    ).toMatchObject({ status: 'not_running' });
    releaseCommit();
    await waitForSettled(store, config.scopeId, started);
    expect(store.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'completed',
      result: 'Committed result.',
    });
  });

  it('fails closed for unknown, cross-parent, and mismatched-identity continuations', async () => {
    const userId = 'lineage-user';
    const firstParentId = randomUUID();
    const secondParentId = randomUUID();
    await Promise.all([saveParent(userId, firstParentId), saveParent(userId, secondParentId)]);
    const store = new SubagentThreadTaskStore(methods);
    const firstConfig = buildSubagentThreadTaskConfig(store, {
      userId,
      parentConversationId: firstParentId,
    });
    const secondConfig = buildSubagentThreadTaskConfig(store, {
      userId,
      parentConversationId: secondParentId,
    });
    const created = store.start(
      taskRequest(firstConfig.scopeId, {
        parentAgentId: 'agent-a',
        subagentType: 'self',
      }),
    );
    await waitForSettled(store, firstConfig.scopeId, created);

    const attempts = [
      {
        config: firstConfig,
        threadId: randomUUID(),
        overrides: {},
      },
      {
        config: secondConfig,
        threadId: requireThreadId(created),
        overrides: { parentAgentId: 'agent-a', subagentType: 'self' },
      },
      {
        config: firstConfig,
        threadId: requireThreadId(created),
        overrides: { parentAgentId: 'agent-b', subagentType: 'self' },
      },
      {
        config: firstConfig,
        threadId: requireThreadId(created),
        overrides: {
          parentAgentId: 'agent-a',
          subagentKind: 'graph' as const,
          subagentType: 'self',
        },
      },
    ];

    for (const attempt of attempts) {
      const run = jest.fn(taskRequest(attempt.config.scopeId).run);
      const rejected = store.start(
        taskRequest(attempt.config.scopeId, {
          threadId: attempt.threadId,
          run,
          ...attempt.overrides,
        }),
      );
      await waitForSettled(store, attempt.config.scopeId, rejected);
      expect(run).not.toHaveBeenCalled();
      expect(
        store.claim(attempt.config.scopeId, requireAccepted(rejected).task.taskId),
      ).toMatchObject({ status: 'error' });
    }
  });

  it('does not persist arbitrary executor details into the visible child chat', async () => {
    loggerErrorSpy.mockClear();
    const userId = 'safe-error-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          throw new Error('Authorization: Bearer provider-secret');
        },
      }),
    );
    await waitForSettled(store, config.scopeId, started);

    const messages = await methods.getMessages({
      user: userId,
      conversationId: requireThreadId(started),
    });
    expect(messages[messages.length - 1]?.text).toBe(
      'Subagent task failed: The child run could not be completed.',
    );
    expect(JSON.stringify(messages)).not.toContain('provider-secret');
    expect(
      JSON.stringify(store.claim(config.scopeId, requireAccepted(started).task.taskId)),
    ).not.toContain('provider-secret');
    expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain('provider-secret');
  });

  it('bounds durable delegation depth to one by default', async () => {
    const userId = 'depth-user';
    const rootConversationId = randomUUID();
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId, {
      subagentThread: {
        rootConversationId,
        parentConversationId: rootConversationId,
        parentMessageId: randomUUID(),
        parentToolCallId: randomUUID(),
        parentAgentId: 'root-agent',
        subagentType: 'researcher-agent',
        subagentKind: 'agent',
        depth: 1,
      },
    });
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(taskRequest(config.scopeId).run);

    expect(store.canCreateChildThread(0)).toBe(true);
    expect(store.canCreateChildThread(1)).toBe(false);
    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    expect(run).not.toHaveBeenCalled();
    expect(store.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'error',
    });
    expect(await methods.getConvo(userId, requireThreadId(started))).toBeNull();
  });
});
