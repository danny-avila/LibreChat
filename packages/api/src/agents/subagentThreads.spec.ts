import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import {
  createMethods,
  createModels,
  getTenantId,
  getUserId,
  logger,
  tenantStorage,
} from '@librechat/data-schemas';
import type {
  SubagentTaskClaim,
  SubagentTaskControlCommand,
  SubagentTaskControlResult,
  SubagentTaskRuntime,
  SubagentTaskSnapshot,
  SubagentTaskStartRequest,
  SubagentTaskStartResult,
} from '@librechat/agents';
import type { AllMethods, IConversation, IMessage } from '@librechat/data-schemas';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type {
  SubagentTaskControlHandler,
  SubagentTaskControlTransport,
} from './subagentTaskRouting';
import type { SubagentTaskWakeupRegistration } from './subagentThreads';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import {
  buildSubagentThreadTaskConfig,
  createSubagentThreadTaskStore,
  SubagentThreadTaskStore,
} from './subagentThreads';
import { SubagentTaskOwnerUnavailableError } from './subagentTaskRouting';
import { createSubagentAttemptKey } from './subagentThreadIds';
import { createSubagentUsageSink } from './usage';

let mongod: MongoMemoryServer;
let methods: AllMethods;
let loggerErrorSpy: jest.SpyInstance;

class TestTaskRoutingHub {
  readonly owners = new Map<string, TestTaskControlTransport>();

  key(scopeId: string, taskId: string): string {
    return `${scopeId}\u0000${taskId}`;
  }
}

class TestTaskControlTransport implements SubagentTaskControlTransport {
  private handler?: SubagentTaskControlHandler;
  readonly registrations: Array<{ scopeId: string; taskId: string; ttlMs: number }> = [];

  constructor(private readonly hub: TestTaskRoutingHub) {}

  async bind(handler: SubagentTaskControlHandler): Promise<void> {
    this.handler = handler;
  }

  async registerTask(scopeId: string, taskId: string, ttlMs: number): Promise<void> {
    this.registrations.push({ scopeId, taskId, ttlMs });
    this.hub.owners.set(this.hub.key(scopeId, taskId), this);
  }

  async hasTasks(scopeId: string): Promise<boolean> {
    const prefix = `${scopeId}\u0000`;
    return [...this.hub.owners.keys()].some((key) => key.startsWith(prefix));
  }

  async claim(scopeId: string, taskId: string): Promise<SubagentTaskClaim | undefined> {
    return this.hub.owners.get(this.hub.key(scopeId, taskId))?.handler?.claim(scopeId, taskId);
  }

  async control(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
    _invocationId: string,
  ): Promise<SubagentTaskControlResult | undefined> {
    return this.hub.owners
      .get(this.hub.key(scopeId, taskId))
      ?.handler?.control(scopeId, taskId, command, _invocationId);
  }

  async list(scopeId: string): Promise<SubagentTaskSnapshot[]> {
    return [...this.remoteOwners(scopeId)].flatMap((owner) => owner.handler?.list(scopeId) ?? []);
  }

  async cancelScope(scopeId: string, threadIds: string[] | null): Promise<number> {
    let cancelled = 0;
    for (const owner of this.remoteOwners(scopeId)) {
      cancelled += owner.handler?.cancelScope(scopeId, threadIds) ?? 0;
    }
    return cancelled;
  }

  async destroy(): Promise<void> {}

  private remoteOwners(scopeId: string): Set<TestTaskControlTransport> {
    const owners = new Set<TestTaskControlTransport>();
    const prefix = `${scopeId}\u0000`;
    for (const [key, owner] of this.hub.owners) {
      if (key.startsWith(prefix) && owner !== this) {
        owners.add(owner);
      }
    }
    return owners;
  }
}

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

function replayTransport(claim: SubagentTaskClaim): SubagentTaskControlTransport {
  return {
    bind: async () => undefined,
    registerTask: async () => undefined,
    hasTasks: async () => true,
    claim: async () => claim,
    control: async () => undefined,
    list: async () => [],
    cancelScope: async () => 0,
    destroy: async () => undefined,
  };
}

function threadSnapshot(taskId: string): SubagentTaskSnapshot {
  return {
    taskId,
    subagentType: 'researcher',
    status: 'cancelled',
    createdAt: 1,
    updatedAt: 2,
    resultAvailable: false,
    resultClaimed: true,
    pendingControls: 0,
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

async function waitUntil(condition: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${description}.`);
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

  it('registers a host-safe wakeup before child provider work begins', async () => {
    const userId = 'wakeup-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const run = jest.fn(taskRequest('').run);
    const onTaskPrepared = jest.fn(async (registration: SubagentTaskWakeupRegistration) => {
      const messages = await methods.getMessages({
        user: userId,
        conversationId: registration.threadId,
        messageId: `${registration.taskId}:assistant`,
      });
      expect(messages).toHaveLength(0);
      expect(run).not.toHaveBeenCalled();
    });
    const store = new SubagentThreadTaskStore(methods, { onTaskPrepared });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        parentRunId: 'parent-response-1',
        parentAgentId: 'agent_parent_1',
        run,
      }),
    );
    await waitForSettled(store, config.scopeId, started);

    const settledTask = store.get(config.scopeId, requireAccepted(started).task.taskId);
    expect(settledTask?.error).toBeUndefined();
    expect(settledTask).toMatchObject({
      status: 'completed',
    });
    expect(onTaskPrepared).toHaveBeenCalledWith({
      userId,
      parentConversationId,
      parentMessageId: 'parent-response-1',
      parentAgentId: 'agent_parent_1',
      taskId: requireAccepted(started).task.taskId,
      threadId: requireThreadId(started),
      subagentType: 'researcher-agent',
      createdAt: expect.any(Number),
    });
  });

  it('fails before provider work and keeps the durable failure collectable when registration fails', async () => {
    const userId = 'wakeup-failure-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const run = jest.fn(taskRequest('').run);
    const store = new SubagentThreadTaskStore(methods, {
      onTaskPrepared: async () => Promise.reject(new Error('trigger queue unavailable')),
    });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    expect(run).not.toHaveBeenCalled();
    await expect(
      store.claimTask(config.scopeId, requireAccepted(started).task.taskId),
    ).resolves.toMatchObject({
      status: 'error',
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

  it('reconstructs trusted owner context after the admitting request has ended', async () => {
    const userId = 'detached-context-user';
    const tenantId = 'detached-context-tenant';
    const parentConversationId = randomUUID();
    await tenantStorage.run({ tenantId, userId }, async () =>
      saveParent(userId, parentConversationId, { tenantId }),
    );

    const observedContexts: Array<{ tenantId?: string; userId?: string }> = [];
    const observeContext = () => {
      observedContexts.push({ tenantId: getTenantId(), userId: getUserId() });
    };
    const store = new SubagentThreadTaskStore(methods, {
      isOwnerActive: async () => {
        observeContext();
        return true;
      },
    });
    const config = buildSubagentThreadTaskConfig(store, {
      userId,
      tenantId,
      parentConversationId,
    });
    const defaultRun = taskRequest(config.scopeId).run;
    const run = jest.fn(async (...args: Parameters<typeof defaultRun>) => {
      observeContext();
      return defaultRun(...args);
    });

    /** `start` deliberately runs outside `tenantStorage.run`: the detached task
     * owns only its serialized host scope once the HTTP request has returned. */
    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    expect(run).toHaveBeenCalledTimes(1);
    expect(observedContexts.length).toBeGreaterThan(0);
    expect(observedContexts).toEqual(observedContexts.map(() => ({ tenantId, userId })));
    const messages = await tenantStorage.run({ tenantId, userId }, async () =>
      methods.getMessages({ user: userId, conversationId: requireThreadId(started) }),
    );
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.tenantId === tenantId)).toBe(true);
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
    const firstWakeup = jest.fn(async (_registration: SubagentTaskWakeupRegistration) => undefined);
    const replayWakeup = jest.fn(
      async (_registration: SubagentTaskWakeupRegistration) => undefined,
    );
    const firstWorker = new SubagentThreadTaskStore(methods, { onTaskPrepared: firstWakeup });
    const secondWorker = new SubagentThreadTaskStore(methods, { onTaskPrepared: replayWakeup });
    const config = buildSubagentThreadTaskConfig(firstWorker, { userId, parentConversationId });
    const firstRun = jest.fn(async () => ({
      content: 'Original durable result.',
      messages: [new HumanMessage('Run once.'), new AIMessage('Original durable result.')],
    }));
    const firstParentRunId = 'original-parent-response';
    const first = firstWorker.start(
      taskRequest(config.scopeId, {
        idempotencyKey: 'cross-worker-attempt',
        parentRunId: firstParentRunId,
        requestFingerprint: 'same-inputs',
        input: 'Run once.',
        run: firstRun,
      }),
    );
    await waitForSettled(firstWorker, config.scopeId, first);
    const durableAttempt = await methods.getMessages(
      { user: userId, conversationId: requireThreadId(first) },
      '+subagentTask',
    );
    expect(durableAttempt[durableAttempt.length - 1]?.subagentTask?.parentRunId).toBe(
      firstParentRunId,
    );

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
    expect(firstWakeup).toHaveBeenCalledTimes(1);
    const firstRegistration = firstWakeup.mock.calls[0]?.[0];
    const replayRegistration = replayWakeup.mock.calls[0]?.[0];
    expect(firstRegistration?.createdAt).toBe(durableAttempt[0]?.createdAt?.getTime());
    expect(replayRegistration?.createdAt).toBe(firstRegistration?.createdAt);
    expect(replayWakeup).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: requireAccepted(first).task.taskId,
        parentMessageId: firstParentRunId,
        createdAt: firstRegistration?.createdAt,
      }),
    );
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
    let leaseDeadline = new Date(0);
    let renewedPastDeadline = false;
    const slowMethods = {
      ...methods,
      acquireSubagentThreadLease: jest.fn(
        async (...args: Parameters<AllMethods['acquireSubagentThreadLease']>) => {
          const acquired = await methods.acquireSubagentThreadLease(...args);
          if (acquired) {
            leaseDeadline = args[0].expiresAt;
          }
          return acquired;
        },
      ),
      renewSubagentThreadLease: jest.fn(
        async (...args: Parameters<AllMethods['renewSubagentThreadLease']>) => {
          const renewed = await methods.renewSubagentThreadLease(...args);
          renewedPastDeadline ||= renewed && args[0].now > leaseDeadline;
          return renewed;
        },
      ),
      getMessages: jest.fn(async (...args: Parameters<AllMethods['getMessages']>) => {
        if (blockNextRead && args[0].conversationId === slowThreadId) {
          blockNextRead = false;
          markPreparing();
          await preparationRelease;
        }
        return methods.getMessages(...args);
      }),
    };
    const options = { leaseTtlMs: 500, leaseHeartbeatMs: 50 };
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
    /** Wait for evidence rather than a fixed delay: a renewal that succeeds after the
     * acquired lease's own deadline proves the heartbeat carried it past expiry. */
    await waitUntil(() => renewedPastDeadline, 'the shared lease to outlive its original deadline');

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

  it('cancels a child when its lease renewal only commits after expiry', async () => {
    const userId = 'late-lease-renewal-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let providerEntered = false;
    let previousExpiry = 0;
    let markLateRenewal = (): void => undefined;
    const lateRenewal = new Promise<void>((resolve) => {
      markLateRenewal = resolve;
    });
    const slowMethods = {
      ...methods,
      renewSubagentThreadLease: jest.fn(
        async (...args: Parameters<AllMethods['renewSubagentThreadLease']>) => {
          if (providerEntered) {
            markLateRenewal();
            /** Wait on the last confirmed lease deadline rather than a tiny fixed TTL:
             * the renewal definitely commits after the gap, without assuming how fast
             * a loaded runner completes preparation and its first Mongo write. */
            await new Promise<void>((resolve) =>
              setTimeout(resolve, Math.max(0, previousExpiry - Date.now() + 10)),
            );
          }
          const renewed = await methods.renewSubagentThreadLease(...args);
          if (renewed) {
            previousExpiry = args[0].expiresAt.getTime();
          }
          return renewed;
        },
      ),
    };
    const store = new SubagentThreadTaskStore(slowMethods, {
      leaseTtlMs: 1_000,
      leaseHeartbeatMs: 20,
    });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(async (runtime: SubagentTaskRuntime) => {
      providerEntered = true;
      return new Promise<{ content: string }>((_resolve, reject) => {
        runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), {
          once: true,
        });
      });
    });
    const started = store.start(taskRequest(config.scopeId, { run }));

    await lateRenewal;
    await waitForSettled(store, config.scopeId, started);

    expect(run).toHaveBeenCalledTimes(1);
    expect(store.claim(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'cancelled',
    });
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

  it('routes live task polling and controls to the replica that owns the execution', async () => {
    const userId = 'routed-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods);
    const requesterStore = new SubagentThreadTaskStore(methods);
    const ownerTransport = new TestTaskControlTransport(hub);
    await ownerStore.configureTaskControlTransport(ownerTransport);
    await requesterStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    let finish = (_value: { content: string }): void => undefined;
    const result = new Promise<{ content: string }>((resolve) => {
      finish = resolve;
    });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async () => result,
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await Promise.resolve();
    expect(ownerTransport.registrations).toContainEqual({
      scopeId: config.scopeId,
      taskId,
      ttlMs: 30_000,
    });

    await expect(requesterStore.hasTasks(config.scopeId)).resolves.toBe(true);
    await expect(requesterStore.listTasks(config.scopeId)).resolves.toEqual([
      expect.objectContaining({ taskId, status: 'running' }),
    ]);
    await expect(
      requesterStore.controlTask(config.scopeId, taskId, {
        action: 'queue',
        message: 'Verify the primary source too.',
      }),
    ).resolves.toMatchObject({ status: 'accepted' });

    finish({ content: 'Cross-replica result.' });
    await waitForSettled(ownerStore, config.scopeId, started);
    await expect(requesterStore.claimTask(config.scopeId, taskId)).resolves.toMatchObject({
      status: 'completed',
      result: 'Cross-replica result.',
    });
    await expect(requesterStore.claimTask(config.scopeId, taskId)).resolves.toMatchObject({
      status: 'claimed',
    });
    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      requesterStore.destroyTaskControlTransport(),
    ]);
  });

  it('applies one control invocation once whether it arrives locally or through routing', async () => {
    const userId = 'invocation-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods);
    const requesterStore = new SubagentThreadTaskStore(methods);
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await requesterStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    let finish = (_value: { content: string }): void => undefined;
    const result = new Promise<{ content: string }>((resolve) => {
      finish = resolve;
    });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async () => result,
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await Promise.resolve();

    const steer = { action: 'queue' as const, message: 'Verify the primary source too.' };
    const routed = await requesterStore.controlTask(config.scopeId, taskId, steer, 'invocation-1');
    expect(routed).toMatchObject({ status: 'accepted' });

    /** The same invocation reaching the owner directly replays that result rather than
     * queueing a second steer, so local and routed callers agree. */
    await expect(
      ownerStore.controlTask(config.scopeId, taskId, steer, 'invocation-1'),
    ).resolves.toEqual(routed);
    expect(ownerStore.get(config.scopeId, taskId)?.pendingControls).toBe(1);

    /** Reusing one invocation id for different content is a caller error, not a retry. */
    await expect(
      requesterStore.controlTask(
        config.scopeId,
        taskId,
        { action: 'queue', message: 'Something else entirely.' },
        'invocation-1',
      ),
    ).resolves.toMatchObject({ status: 'invalid' });
    expect(ownerStore.get(config.scopeId, taskId)?.pendingControls).toBe(1);

    finish({ content: 'Cross-replica result.' });
    await waitForSettled(ownerStore, config.scopeId, started);
    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      requesterStore.destroyTaskControlTransport(),
    ]);
  });

  it('fails a child closed when its owner address cannot be published', async () => {
    const userId = 'unregistered-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const transport = new TestTaskControlTransport(hub);
    transport.registerTask = async () => {
      throw new Error('registration failed');
    };
    const store = new SubagentThreadTaskStore(methods);
    await store.configureTaskControlTransport(transport);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(async () => ({ content: 'never reached' }));
    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);

    /** An unaddressable child cannot be polled, controlled, or cancelled, so no
     * provider work may start behind a failed registration. */
    expect(run).not.toHaveBeenCalled();
    expect(store.get(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'error',
    });
    await store.destroyTaskControlTransport();
  });

  it('returns a lost result to the same poll invocation and refuses a different one', async () => {
    const userId = 'durable-claim-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods);
    const requesterStore = new SubagentThreadTaskStore(methods);
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await requesterStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async () => ({ content: 'Cross-replica result.' }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await waitForSettled(ownerStore, config.scopeId, started);

    await expect(requesterStore.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject(
      { status: 'completed', result: 'Cross-replica result.' },
    );

    /** The owner's one-shot result is gone, but the child's durable thread still holds
     * it, so the invocation that already collected it recovers its own result. */
    await expect(requesterStore.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject(
      { status: 'completed', result: 'Cross-replica result.' },
    );

    /** A different invocation is told it was collected rather than handed a copy. */
    await expect(requesterStore.claimTask(config.scopeId, taskId, 'poll-2')).resolves.toMatchObject(
      { status: 'claimed' },
    );

    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      requesterStore.destroyTaskControlTransport(),
    ]);
  });

  it('bounds a result recovered from its durable child message', async () => {
    const userId = 'large-result-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => ({ content: 'x'.repeat(150_000) }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await waitForSettled(store, config.scopeId, started);

    await expect(store.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject({
      status: 'completed',
    });

    /** The durable message keeps the child's untruncated output, so recovering it
     * must apply the same bound a routed response would have. */
    const recovered = await store.claimTask(config.scopeId, taskId, 'poll-1');
    expect(recovered.status).toBe('completed');
    if (recovered.status === 'completed') {
      expect(recovered.result.length).toBeLessThanOrEqual(100_000);
    }
  });

  it('recovers a durable result after the owning process and registration are gone', async () => {
    const userId = 'restarted-owner-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const ownerStore = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async () => ({ content: 'Recovered without owner memory.' }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await waitForSettled(ownerStore, config.scopeId, started);

    /** A fresh store has neither the in-memory task nor a Redis owner registration. */
    const restartedStore = new SubagentThreadTaskStore(methods);
    const unrelatedParentConversationId = randomUUID();
    await saveParent(userId, unrelatedParentConversationId);
    const unrelatedConfig = buildSubagentThreadTaskConfig(restartedStore, {
      userId,
      parentConversationId: unrelatedParentConversationId,
    });
    await expect(
      restartedStore.claimTask(unrelatedConfig.scopeId, taskId, 'wrong-parent-poll'),
    ).resolves.toEqual({ status: 'not_found' });

    await expect(restartedStore.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject(
      {
        status: 'completed',
        result: 'Recovered without owner memory.',
      },
    );
    await expect(restartedStore.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject(
      {
        status: 'completed',
        result: 'Recovered without owner memory.',
      },
    );
    await expect(restartedStore.claimTask(config.scopeId, taskId, 'poll-2')).resolves.toMatchObject(
      {
        status: 'claimed',
      },
    );
  });

  it('tells a second invocation a retained result was already collected', async () => {
    const userId = 'duplicate-claim-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => ({ content: 'Only one caller may hold this.' }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await waitForSettled(store, config.scopeId, started);
    const threadId = requireThreadId(started);

    await expect(store.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject({
      status: 'completed',
      result: 'Only one caller may hold this.',
    });

    /** An owner replaying a retained response would hand the same terminal result to
     * another invocation; the durable record decides, so that one is told it was
     * already collected rather than being given a second copy. */
    const replayingStore = new SubagentThreadTaskStore(methods);
    await replayingStore.configureTaskControlTransport(
      replayTransport({
        status: 'completed',
        task: { ...threadSnapshot(taskId), threadId, status: 'completed' },
        result: 'Only one caller may hold this.',
      }),
    );
    await expect(replayingStore.claimTask(config.scopeId, taskId, 'poll-2')).resolves.toMatchObject(
      { status: 'claimed' },
    );

    /** The invocation that already holds it still recovers its own result. */
    await expect(replayingStore.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject(
      { status: 'completed', result: 'Only one caller may hold this.' },
    );

    await replayingStore.destroyTaskControlTransport();
  });

  it('refuses to build a store the host wired without a required method', () => {
    const { claimSubagentTaskResult: _omitted, ...incomplete } = methods;

    /** The host wires this from JavaScript, so a missing method has to fail at
     * startup rather than as an unavailable result the first time a task settles. */
    expect(() =>
      createSubagentThreadTaskStore(
        incomplete as unknown as Parameters<typeof createSubagentThreadTaskStore>[0],
      ),
    ).toThrow('claimSubagentTaskResult');
    expect(() => createSubagentThreadTaskStore(methods)).not.toThrow();
  });

  it('renews its own fence while a long deletion is still running', async () => {
    const userId = 'long-deletion-user';
    const renewals: string[] = [];
    const store = new SubagentThreadTaskStore(methods, {
      ownerDrainPollMs: 1,
      ownerDrainTimeoutMs: 30,
      ownerFenceGraceMs: 60,
      fenceOwnerAdmission: async () => undefined,
      renewOwnerAdmission: async (_userId: string, token: string) => {
        renewals.push(token);
        return true;
      },
      releaseOwnerAdmission: async () => undefined,
    });
    const listLeases = jest.spyOn(methods, 'listActiveSubagentThreadLeases').mockResolvedValue([]);
    try {
      await store.withOwnerDeletionFence(userId, undefined, async () => {
        /** A deletion outlasting its 90ms fence window must not let the fence lapse. */
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        return 'deleted';
      });
    } finally {
      listLeases.mockRestore();
    }

    expect(renewals.length).toBeGreaterThan(0);
    expect(new Set(renewals).size).toBe(1);
  });

  it('re-fences and drains again after a fence gap during deletion', async () => {
    const userId = 'deletion-gap-user';
    let recoveryAllowed = false;
    const fenceOwnerAdmission = jest.fn(async () => undefined);
    const listActiveSubagentThreadLeases = jest.fn(async () => []);
    const testMethods = { ...methods, listActiveSubagentThreadLeases };
    const renewOwnerAdmission = jest.fn(async () => {
      if (!recoveryAllowed) {
        throw new Error('database temporarily unavailable');
      }
      return false;
    });
    const store = new SubagentThreadTaskStore(testMethods, {
      ownerDrainPollMs: 1,
      ownerDrainTimeoutMs: 30,
      ownerFenceGraceMs: 60,
      fenceOwnerAdmission,
      renewOwnerAdmission,
      releaseOwnerAdmission: async () => undefined,
    });
    await expect(
      store.withOwnerDeletionFence(userId, undefined, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        recoveryAllowed = true;
        return 'deleted';
      }),
    ).resolves.toBe('deleted');

    expect(fenceOwnerAdmission).toHaveBeenCalledTimes(2);
    expect(listActiveSubagentThreadLeases).toHaveBeenCalledTimes(2);
  });

  it('does not report deletion success when post-gap recovery fails', async () => {
    const userId = 'deletion-gap-failure-user';
    const listActiveSubagentThreadLeases = jest.fn(async () => []);
    const testMethods = { ...methods, listActiveSubagentThreadLeases };
    const store = new SubagentThreadTaskStore(testMethods, {
      ownerDrainPollMs: 1,
      ownerDrainTimeoutMs: 30,
      ownerFenceGraceMs: 60,
      fenceOwnerAdmission: async () => undefined,
      renewOwnerAdmission: async () => {
        throw new Error('database unavailable');
      },
      releaseOwnerAdmission: async () => undefined,
    });
    await expect(
      store.withOwnerDeletionFence(userId, undefined, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        return 'deleted';
      }),
    ).rejects.toThrow('database unavailable');
  });

  it('cancels a grandchild whose own conversation the cascade removed', async () => {
    const userId = 'cascade-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods, { maxThreadDepth: 3 });
    const deletingStore = new SubagentThreadTaskStore(methods);
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await deletingStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const childConversationId = randomUUID();
    await saveParent(userId, childConversationId, {
      subagentThread: {
        rootConversationId: parentConversationId,
        parentConversationId,
        parentAgentId: 'parent-agent',
        subagentType: 'researcher',
        depth: 1,
      },
    });
    /** The grandchild runs inside the child's scope, which a plan naming only the
     * deleted root never covers. */
    const config = buildSubagentThreadTaskConfig(ownerStore, {
      userId,
      parentConversationId: childConversationId,
    });
    let finish = (_value: { content: string }): void => undefined;
    const running = new Promise<{ content: string }>((resolve) => {
      finish = resolve;
    });
    const started = ownerStore.start(taskRequest(config.scopeId, { run: async () => running }));
    const taskId = requireAccepted(started).task.taskId;
    await Promise.resolve();

    const plan = await deletingStore.planCancellationForConversations(userId, [
      parentConversationId,
    ]);
    await expect(
      deletingStore.cancelPlan(plan, [parentConversationId, childConversationId]),
    ).resolves.toBeGreaterThanOrEqual(1);
    await waitForSettled(ownerStore, config.scopeId, started);
    expect(ownerStore.get(config.scopeId, taskId)).toMatchObject({ status: 'cancelled' });

    finish({ content: 'late' });
    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      deletingStore.destroyTaskControlTransport(),
    ]);
  });

  it('reports a result as unavailable when its collection cannot be recorded', async () => {
    const userId = 'unrecordable-claim-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => ({ content: 'Recorded before it is handed over.' }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await waitForSettled(store, config.scopeId, started);

    /** Handing the result over without recording its claimant would let another
     * invocation collect the same one-shot output once the database recovers. */
    const claimResult = jest
      .spyOn(methods, 'claimSubagentTaskResult')
      .mockRejectedValueOnce(new Error('database unavailable'));
    try {
      await expect(store.claimTask(config.scopeId, taskId, 'poll-1')).rejects.toBeInstanceOf(
        SubagentTaskOwnerUnavailableError,
      );
    } finally {
      claimResult.mockRestore();
    }

    /** The result stays unclaimed, so a later poll still collects it exactly once. */
    await expect(store.claimTask(config.scopeId, taskId, 'poll-1')).resolves.toMatchObject({
      status: 'completed',
      result: 'Recorded before it is handed over.',
    });
    await expect(store.claimTask(config.scopeId, taskId, 'poll-2')).resolves.toMatchObject({
      status: 'claimed',
    });
  });

  it('keeps a live task’s control invocation when settled tasks fill the window', async () => {
    const userId = 'invocation-eviction-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods, {
      maxControlInvocations: 2,
      completedTtlMs: 20,
    });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    let finish = (_value: { content: string }): void => undefined;
    const running = new Promise<{ content: string }>((resolve) => {
      finish = resolve;
    });
    const live = store.start(taskRequest(config.scopeId, { run: async () => running }));
    const liveTaskId = requireAccepted(live).task.taskId;
    const settled = store.start(
      taskRequest(config.scopeId, { run: async () => ({ content: 'done' }) }),
    );
    const settledTaskId = requireAccepted(settled).task.taskId;
    await waitForSettled(store, config.scopeId, settled);

    const steer = { action: 'queue' as const, message: 'Verify the primary source too.' };
    const applied = store.controlInvocation(config.scopeId, liveTaskId, steer, 'invocation-live');
    expect(applied).toMatchObject({ status: 'accepted' });
    store.controlInvocation(config.scopeId, settledTaskId, steer, 'invocation-settled');

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (store.get(config.scopeId, settledTaskId) == null) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    expect(store.get(config.scopeId, settledTaskId)).toBeUndefined();

    /** The window is full, so admitting another invocation sweeps the records of tasks
     * this store no longer holds. The live task's record survives, so a caller
     * retrying it replays instead of steering that child a second time. */
    store.controlInvocation(config.scopeId, liveTaskId, steer, 'invocation-later');
    expect(store.controlInvocation(config.scopeId, liveTaskId, steer, 'invocation-live')).toEqual(
      applied,
    );
    expect(store.get(config.scopeId, liveTaskId)?.pendingControls).toBe(2);

    /** With every remaining record belonging to a live task, a further invocation is
     * refused rather than displacing one: applying it unrecorded would let its own
     * retry apply the command twice. */
    expect(
      store.controlInvocation(config.scopeId, liveTaskId, steer, 'invocation-third'),
    ).toMatchObject({ status: 'invalid' });
    expect(store.get(config.scopeId, liveTaskId)?.pendingControls).toBe(2);

    finish({ content: 'done' });
    await waitForSettled(store, config.scopeId, live);
  });

  it('caps the merged local and remote task list the poll tool reads', async () => {
    const userId = 'merged-list-cap-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    /** The base store caps concurrent runs twice over — ten per scope and a hundred
     * across the store — and this test is about what the merge returns rather than
     * about admission, so both are raised to admit every task it starts. */
    const store = new SubagentThreadTaskStore(methods, {
      maxRunningPerScope: 150,
      maxRunningTotal: 150,
    });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const remote = Array.from({ length: 150 }, (_unused, index) =>
      threadSnapshot(`remote-task-${index + 1}`),
    );
    await store.configureTaskControlTransport({
      ...replayTransport({ status: 'claimed', task: threadSnapshot('remote-task-1') }),
      list: async () => remote,
    });

    const local = await Promise.all(
      Array.from({ length: 150 }, () => store.start(taskRequest(config.scopeId))),
    );
    await Promise.all(local.map((started) => waitForSettled(store, config.scopeId, started)));
    expect(store.list(config.scopeId)).toHaveLength(150);

    /** Each owner's reply and the remote aggregation are bounded on their own, but the
     * poll tool reads this merge — 300 distinct tasks must still arrive as 200. */
    await expect(store.listTasks(config.scopeId)).resolves.toHaveLength(200);

    await store.destroyTaskControlTransport();
  });

  it('routes a control for a remote task while the local invocation window is full', async () => {
    const userId = 'remote-control-under-load-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods, { maxControlInvocations: 1 });
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const remoteResult: SubagentTaskControlResult = {
      status: 'cancelled',
      task: threadSnapshot('remote-task'),
    };
    const routed = jest.fn(async () => remoteResult);
    await store.configureTaskControlTransport({
      ...replayTransport({ status: 'claimed', task: threadSnapshot('remote-task') }),
      control: routed,
    });

    let finish = (_value: { content: string }): void => undefined;
    const running = new Promise<{ content: string }>((resolve) => {
      finish = resolve;
    });
    const live = store.start(taskRequest(config.scopeId, { run: async () => running }));
    const liveTaskId = requireAccepted(live).task.taskId;
    const steer = { action: 'queue' as const, message: 'Check the changelog as well.' };
    expect(store.controlInvocation(config.scopeId, liveTaskId, steer, 'local-1')).toMatchObject({
      status: 'accepted',
    });

    /** The window holds a live task's record and cannot be swept, but a task this
     * replica never owned is the remote owner's to refuse or apply. */
    await expect(
      store.controlTask(config.scopeId, 'remote-task', { action: 'cancel' }, 'remote-1'),
    ).resolves.toEqual(remoteResult);
    expect(routed).toHaveBeenCalledWith(
      config.scopeId,
      'remote-task',
      { action: 'cancel' },
      'remote-1',
    );

    finish({ content: 'done' });
    await waitForSettled(store, config.scopeId, live);
    await store.destroyTaskControlTransport();
  });

  it('fails a deletion closed when the admission fence cannot be held', async () => {
    const userId = 'fence-lapse-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods, {
      ownerDrainTimeoutMs: 60,
      ownerFenceGraceMs: 60,
      fenceOwnerAdmission: async () => undefined,
      renewOwnerAdmission: async () => {
        throw new Error('database unavailable');
      },
      releaseOwnerAdmission: async () => undefined,
    });
    /** A drain that outlasts the 120ms fence window while every renewal rejects: the
     * last confirmed `fencedUntil` passes and nothing is left holding admission shut. */
    const leases = jest
      .spyOn(methods, 'listActiveSubagentThreadLeases')
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        return [];
      });
    const deletion = jest.fn(async () => 'deleted');
    try {
      await expect(store.withOwnerDeletionFence(userId, undefined, deletion)).rejects.toThrow(
        'admission fence expired',
      );
      /** Nothing was removed, so the caller can retry once the fence holds again. */
      expect(deletion).not.toHaveBeenCalled();
    } finally {
      leases.mockRestore();
    }
  });

  it('treats a renewal that lands after its own deadline as a lapse', async () => {
    const userId = 'fence-late-renewal-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let renewals = 0;
    const store = new SubagentThreadTaskStore(methods, {
      ownerDrainTimeoutMs: 60,
      ownerFenceGraceMs: 60,
      fenceOwnerAdmission: async () => undefined,
      /** Succeeds, but the first write only lands well past the 120ms deadline it was
       * meant to extend — admission stood open for the difference. */
      renewOwnerAdmission: async () => {
        renewals += 1;
        if (renewals === 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 150));
        }
        return true;
      },
      releaseOwnerAdmission: async () => undefined,
    });
    const leases = jest
      .spyOn(methods, 'listActiveSubagentThreadLeases')
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        return [];
      });
    const deletion = jest.fn(async () => 'deleted');
    try {
      await expect(store.withOwnerDeletionFence(userId, undefined, deletion)).rejects.toThrow(
        'admission fence expired',
      );
      /** Every renewal reported success, so a deadline restored from the write's own
       * start time would have read as continuously fenced. */
      expect(renewals).toBeGreaterThan(0);
      expect(deletion).not.toHaveBeenCalled();
    } finally {
      leases.mockRestore();
    }
  });

  it('releases the owner fence after an in-flight renewal instead of racing it', async () => {
    const userId = 'fence-renewal-race-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let releaseRenewal = (): void => undefined;
    const renewalBlocked = new Promise<void>((resolve) => {
      releaseRenewal = resolve;
    });
    let markRenewing = (): void => undefined;
    const renewing = new Promise<void>((resolve) => {
      markRenewing = resolve;
    });
    const order: string[] = [];
    const fenceOwnerAdmission = jest.fn(async () => {
      order.push('fence');
    });
    /** The renewal is still waiting on the database when the deletion finishes, and it
     * reports the fence lost — the shape that used to leave a fresh, unreleasable one. */
    let renewalAttempts = 0;
    const renewOwnerAdmission = jest.fn(async () => {
      renewalAttempts += 1;
      markRenewing();
      await renewalBlocked;
      order.push('renew');
      /** The in-flight renewal discovers the entry missing and re-takes it; the
       * recovery renewal then confirms that replacement while the second drain runs. */
      return renewalAttempts > 1;
    });
    const releaseOwnerAdmission = jest.fn(async () => {
      order.push('release');
    });
    const testMethods = {
      ...methods,
      listActiveSubagentThreadLeases: jest.fn(async () => []),
    };
    const store = new SubagentThreadTaskStore(testMethods, {
      ownerDrainTimeoutMs: 60,
      ownerFenceGraceMs: 60,
      fenceOwnerAdmission,
      renewOwnerAdmission,
      releaseOwnerAdmission,
    });

    let releaseDeletion = (): void => undefined;
    const deletionBlocked = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    const fenced = store.withOwnerDeletionFence(userId, undefined, async () => {
      await deletionBlocked;
      return 'deleted';
    });
    await renewing;
    releaseDeletion();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual(['fence']);

    releaseRenewal();
    await expect(fenced).resolves.toBe('deleted');
    /** The lost entry is re-taken before the recovery drain and only released after
     * the in-flight renewal and recovery renewal both settle. */
    expect(order).toEqual(['fence', 'renew', 'fence', 'renew', 'release']);
    expect(fenceOwnerAdmission).toHaveBeenCalledTimes(2);
  });

  it('cancels each drained task once and retries only unconfirmed deliveries', async () => {
    const userId = 'drain-user';
    const parentConversationId = randomUUID();
    const store = new SubagentThreadTaskStore(methods, {
      ownerDrainPollMs: 1,
      ownerDrainTimeoutMs: 5_000,
    });
    const lease = { taskId: 'task-1', parentConversationId, conversationId: randomUUID() };
    const listLeases = jest
      .spyOn(methods, 'listActiveSubagentThreadLeases')
      .mockResolvedValueOnce([lease])
      .mockResolvedValueOnce([lease])
      .mockResolvedValueOnce([lease])
      .mockResolvedValueOnce([lease])
      .mockResolvedValue([]);
    const controlTask = jest
      .spyOn(store, 'controlTask')
      .mockRejectedValueOnce(new Error('owner unavailable'))
      .mockResolvedValueOnce({ status: 'not_found' })
      .mockResolvedValue({ status: 'cancelled', task: threadSnapshot('task-1') });
    try {
      await store.cancelAndDrainForOwner(userId);

      /** An unconfirmed delivery is retried under the same invocation — including a
       * `not_found`, which means the owner's registration is missing while its lease
       * is live — and once the owner confirms, the drain only waits for the lease. */
      expect(controlTask).toHaveBeenCalledTimes(3);
      expect(new Set(controlTask.mock.calls.map((call) => call[3])).size).toBe(1);
      expect(listLeases).toHaveBeenCalledTimes(5);
    } finally {
      listLeases.mockRestore();
      controlTask.mockRestore();
    }
  });

  it('fences owner admission around the deletion it drains for', async () => {
    const userId = 'fenced-user';
    const order: string[] = [];
    const tokens: string[] = [];
    const renewed: string[] = [];
    const released: string[] = [];
    const store = new SubagentThreadTaskStore(methods, {
      ownerDrainPollMs: 1,
      fenceOwnerAdmission: async (_userId: string, token: string) => {
        tokens.push(token);
        order.push('fence');
      },
      renewOwnerAdmission: async (_userId: string, token: string) => {
        renewed.push(token);
        return true;
      },
      releaseOwnerAdmission: async (_userId: string, token: string) => {
        released.push(token);
        order.push('release');
      },
    });
    const listLeases = jest
      .spyOn(methods, 'listActiveSubagentThreadLeases')
      .mockImplementation(async () => {
        order.push('drain');
        return [];
      });
    try {
      await expect(
        store.withOwnerDeletionFence(userId, undefined, async () => {
          order.push('delete');
          return 'deleted';
        }),
      ).resolves.toBe('deleted');
      expect(order).toEqual(['fence', 'drain', 'delete', 'release']);
      /** Only the fence this deletion took is lifted, so an overlapping deletion
       * keeps admission closed until its own fence is released. */
      expect(released).toEqual(tokens);
      expect(tokens[0]).toEqual(expect.any(String));

      /** A failed deletion still lifts the fence, so one bad request cannot leave the
       * account unable to run subagents. */
      order.length = 0;
      await expect(
        store.withOwnerDeletionFence(userId, undefined, async () => {
          throw new Error('deletion failed');
        }),
      ).rejects.toThrow('deletion failed');
      expect(order).toEqual(['fence', 'drain', 'release']);
    } finally {
      listLeases.mockRestore();
    }
  });

  it('routes conversation-deletion cancellation to a remote task owner', async () => {
    const userId = 'routed-delete-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods);
    const deletingStore = new SubagentThreadTaskStore(methods);
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await deletingStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async (runtime) =>
          new Promise((_resolve, reject) => {
            runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), {
              once: true,
            });
          }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    await Promise.resolve();

    const plan = await deletingStore.planCancellationForConversations(userId, [
      parentConversationId,
    ]);
    await expect(deletingStore.cancelPlan(plan)).resolves.toBe(1);
    await waitForSettled(ownerStore, config.scopeId, started);
    expect(ownerStore.get(config.scopeId, taskId)).toMatchObject({ status: 'cancelled' });

    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      deletingStore.destroyTaskControlTransport(),
    ]);
  });

  it('routes cancellation for a deleted child thread to its remote owner', async () => {
    const userId = 'routed-child-delete-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods);
    const deletingStore = new SubagentThreadTaskStore(methods);
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await deletingStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async (runtime) =>
          new Promise((_resolve, reject) => {
            runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), {
              once: true,
            });
          }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    const threadId = requireThreadId(started);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await methods.getConvo(userId, threadId)) != null) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    expect(await methods.getConvo(userId, threadId)).not.toBeNull();

    /** The parent survives this deletion, so the child's own thread is the only target. */
    const plan = await deletingStore.planCancellationForConversations(userId, [threadId]);
    await expect(deletingStore.cancelPlan(plan)).resolves.toBe(1);
    await waitForSettled(ownerStore, config.scopeId, started);
    expect(ownerStore.get(config.scopeId, taskId)).toMatchObject({ status: 'cancelled' });

    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      deletingStore.destroyTaskControlTransport(),
    ]);
  });

  it('cancels a child admitted after the deletion snapshot from its durable lease', async () => {
    const userId = 'lease-cancel-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods);
    const deletingStore = new SubagentThreadTaskStore(methods);
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await deletingStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    const started = ownerStore.start(
      taskRequest(config.scopeId, {
        run: async (runtime) =>
          new Promise((_resolve, reject) => {
            runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), {
              once: true,
            });
          }),
      }),
    );
    const taskId = requireAccepted(started).task.taskId;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const leases = await methods.listActiveSubagentThreadLeases({
        user: userId,
        now: new Date(),
      });
      if (leases.length > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    /** Production ordering: the plan is resolved first, the cascade is deleted, and
     * only then is the plan replayed against the owner directory. */
    const plan = await deletingStore.planCancellationForConversations(userId, [
      parentConversationId,
    ]);
    await methods.deleteConvos(userId, { conversationId: parentConversationId });
    await expect(
      deletingStore.cancelPlan(plan, [parentConversationId, requireThreadId(started)]),
    ).resolves.toBeGreaterThanOrEqual(1);
    await waitForSettled(ownerStore, config.scopeId, started);
    expect(ownerStore.get(config.scopeId, taskId)).toMatchObject({ status: 'cancelled' });

    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      deletingStore.destroyTaskControlTransport(),
    ]);
  });

  it('drains only active lease addresses when deleting every conversation across replicas', async () => {
    const userId = 'routed-owner-drain-user';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const hub = new TestTaskRoutingHub();
    const ownerStore = new SubagentThreadTaskStore(methods, { ownerDrainPollMs: 5 });
    const deletingStore = new SubagentThreadTaskStore(methods, { ownerDrainPollMs: 5 });
    await ownerStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    await deletingStore.configureTaskControlTransport(new TestTaskControlTransport(hub));
    const config = buildSubagentThreadTaskConfig(ownerStore, { userId, parentConversationId });
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const started = ownerStore.start(
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

    await deletingStore.cancelAndDrainForOwner(userId);
    await waitForSettled(ownerStore, config.scopeId, started);
    expect(ownerStore.get(config.scopeId, requireAccepted(started).task.taskId)).toMatchObject({
      status: 'cancelled',
    });

    await Promise.all([
      ownerStore.destroyTaskControlTransport(),
      deletingStore.destroyTaskControlTransport(),
    ]);
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
