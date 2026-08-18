import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EModelEndpoint, FileSources } from 'librechat-data-provider';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import { createMethods, createModels, logger, tenantStorage } from '@librechat/data-schemas';
import type {
  SubagentTaskRuntime,
  SubagentTaskStartRequest,
  SubagentTaskStartResult,
} from '@librechat/agents';
import type { AllMethods, IConversation, IMessage } from '@librechat/data-schemas';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import { buildSubagentThreadTaskConfig, SubagentThreadTaskStore } from './subagentThreads';
import { ATTACHMENT_ONLY_TEXT } from '~/files/context';
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
    input,
    subagentKind: overrides.subagentKind ?? 'agent',
    subagentType: overrides.subagentType ?? 'researcher-agent',
    run:
      overrides.run ??
      (async (_runtime: SubagentTaskRuntime, initialMessages = []) => {
        const messages = [
          ...initialMessages,
          new HumanMessage(input),
          new AIMessage('Completed the investigation.'),
        ];
        return { content: 'Completed the investigation.', messages };
      }),
    ...(overrides.threadId == null ? {} : { threadId: overrides.threadId }),
  };
}

async function waitForSettled(
  store: SubagentThreadTaskStore,
  scopeId: string,
  started: SubagentTaskStartResult,
): Promise<void> {
  if (!started.accepted) {
    throw new Error('Expected the task to be accepted.');
  }
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = store.get(scopeId, started.task.taskId);
    if (task != null && task.status !== 'running') {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the subagent task.');
}

function requireThreadId(started: SubagentTaskStartResult): string {
  if (!started.accepted || !started.task.threadId) {
    throw new Error('Expected the accepted task to expose its durable thread id.');
  }
  return started.task.threadId;
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
    mongoose.models.File.deleteMany({}),
  ]);
});

describe('SubagentThreadTaskStore', () => {
  it('maps one logical SDK thread to a normal LibreChat conversation', async () => {
    const userId = 'user-1';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });

    const started = store.start(taskRequest(config.scopeId));
    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    const threadId = requireThreadId(started);
    expect(threadId).not.toBe(started.task.taskId);
    await waitForSettled(store, config.scopeId, started);

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
        userRunnable: true,
      },
    });
    const messages = await methods.getMessages(
      { user: userId, conversationId: threadId },
      '+subagentTranscript',
    );
    expect(messages.map((message) => message.text)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
    ]);
    expect(messages[1].subagentTranscript).toMatchObject({
      taskId: started.task.taskId,
      mode: 'append',
    });
  });

  it('keeps a saved-agent child read-only for exactly the active execution lease', async () => {
    const userId = 'user-active-lease';
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
    if (!started.accepted) return;
    const threadId = requireThreadId(started);
    expect(store.isThreadActive(config.scopeId, threadId)).toBe(true);
    await entered;
    expect(await methods.getConvo(userId, threadId)).toMatchObject({
      subagentThread: { userRunnable: false },
    });

    release({
      content: 'Lease completed.',
      messages: [new HumanMessage('Investigate the issue.'), new AIMessage('Lease completed.')],
    });
    await waitForSettled(store, config.scopeId, started);

    expect(store.isThreadActive(config.scopeId, threadId)).toBe(false);
    expect(await methods.getConvo(userId, threadId)).toMatchObject({
      subagentThread: { userRunnable: true },
    });
  });

  it('does not overwrite a child title changed while detached execution is running', async () => {
    const userId = 'user-title-race';
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
    if (!started.accepted) return;
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
      subagentThread: { userRunnable: true },
    });
  });

  it('atomically excludes detached and ordinary turns with the same child lease', async () => {
    const userId = 'user-shared-lease';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;
    const threadId = requireThreadId(first);

    const releaseUserTurn = store.acquireUserTurn(config.scopeId, threadId);
    expect(releaseUserTurn).not.toBeNull();
    expect(
      store.start(taskRequest(config.scopeId, { threadId, input: 'Blocked by the user turn.' })),
    ).toEqual({ accepted: false, reason: 'capacity' });
    releaseUserTurn?.();

    let releaseDetached = (_value: { content: string; messages: BaseMessage[] }): void => undefined;
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const detachedResult = new Promise<{ content: string; messages: BaseMessage[] }>((resolve) => {
      releaseDetached = resolve;
    });
    const detached = store.start(
      taskRequest(config.scopeId, {
        threadId,
        input: 'Hold the detached lease.',
        run: async () => {
          markEntered();
          return detachedResult;
        },
      }),
    );
    if (!detached.accepted) return;
    await entered;
    expect(store.acquireUserTurn(config.scopeId, threadId)).toBeNull();
    releaseDetached({
      content: 'Detached lease complete.',
      messages: [new AIMessage('Detached lease complete.')],
    });
    await waitForSettled(store, config.scopeId, detached);
  });

  it('lets a same-attempt retry reach durable idempotency without owning the user lease', () => {
    const store = new SubagentThreadTaskStore(methods);
    const scopeId = JSON.stringify({ version: 1, userId: 'retry-user', parentConversationId: 'p' });
    const releaseOriginal = store.acquireUserTurn(scopeId, 'child', 'attempt-1');
    const releaseRetry = store.acquireUserTurn(scopeId, 'child', 'attempt-1');

    expect(releaseOriginal).not.toBeNull();
    expect(releaseRetry).not.toBeNull();
    releaseRetry?.();
    expect(store.acquireUserTurn(scopeId, 'child', 'attempt-2')).toBeNull();
    releaseOriginal?.();
    expect(store.acquireUserTurn(scopeId, 'child', 'attempt-2')).not.toBeNull();
  });

  it('finds provisional child leases by trusted owner before the conversation exists', () => {
    const store = new SubagentThreadTaskStore(methods);
    const scopeId = JSON.stringify({
      version: 1,
      userId: 'provisional-user',
      parentConversationId: 'parent',
      tenantId: 'tenant-a',
    });
    const release = store.acquireUserTurn(scopeId, 'provisional-child');

    expect(store.isThreadActiveForOwner('provisional-user', 'provisional-child', 'tenant-a')).toBe(
      true,
    );
    expect(store.isThreadActiveForOwner('different-user', 'provisional-child', 'tenant-a')).toBe(
      false,
    );
    expect(store.isThreadActiveForOwner('provisional-user', 'provisional-child', 'tenant-b')).toBe(
      false,
    );
    release?.();
    expect(store.isThreadActiveForOwner('provisional-user', 'provisional-child', 'tenant-a')).toBe(
      false,
    );
  });

  it('keeps a completed child writable when the optional sidebar refresh fails', async () => {
    const userId = 'user-refresh-failure';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let runnableRefreshes = 0;
    const flakyMethods = {
      ...methods,
      saveConvo: jest.fn(async (...args: Parameters<AllMethods['saveConvo']>) => {
        if (args[1]['subagentThread.userRunnable'] === true) {
          runnableRefreshes += 1;
          if (runnableRefreshes === 2) {
            throw new Error('sidebar refresh failed');
          }
        }
        return methods.saveConvo(...args);
      }),
    };
    const store = new SubagentThreadTaskStore(flakyMethods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, started);
    if (!started.accepted) return;
    const threadId = requireThreadId(started);

    expect(runnableRefreshes).toBe(2);
    expect(store.claim(config.scopeId, started.task.taskId)).toMatchObject({
      status: 'completed',
    });
    expect(await methods.getConvo(userId, threadId)).toMatchObject({
      subagentThread: { userRunnable: true },
    });
    expect(
      (await methods.getMessages({ user: userId, conversationId: threadId })).map(
        (message) => message.text,
      ),
    ).toContain('Completed the investigation.');
  });

  it('lets child deletion win over a concurrently settling detached result', async () => {
    const userId = 'user-delete-during-settlement';
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
    if (!started.accepted) return;

    expect(deletedThreadId).toBe(requireThreadId(started));
    expect(await methods.getConvo(userId, deletedThreadId)).toBeNull();
    expect(await methods.getMessages({ user: userId, conversationId: deletedThreadId })).toEqual(
      [],
    );
    expect(store.claim(config.scopeId, started.task.taskId)).toMatchObject({ status: 'error' });
  });

  it('bills detached usage independently and persists its rollup on the child result', async () => {
    const userId = 'user-detached-usage';
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
    if (!started.accepted) return;

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

  it('reuses the original task and thread for an idempotent detached replay', async () => {
    const userId = 'user-replay';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const request = taskRequest(config.scopeId, { idempotencyKey: 'stable-parent-tool-call' });

    const first = store.start(request);
    const replay = store.start(request);
    expect(first.accepted).toBe(true);
    expect(replay.accepted).toBe(true);
    if (!first.accepted || !replay.accepted) return;
    expect(replay.isNew).toBe(false);
    expect(replay.task.taskId).toBe(first.task.taskId);
    expect(replay.task.threadId).toBe(first.task.threadId);
    await waitForSettled(store, config.scopeId, first);

    const conversations = await (
      mongoose.models.Conversation as mongoose.Model<IConversation>
    ).find({ user: userId });
    expect(conversations).toHaveLength(2);
  });

  it('persists a graph child without misidentifying the team as a saved agent', async () => {
    const userId = 'user-graph';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });

    const started = store.start(
      taskRequest(config.scopeId, {
        subagentKind: 'graph',
        subagentType: 'research_team',
      }),
    );
    await waitForSettled(store, config.scopeId, started);
    if (!started.accepted) return;
    const threadId = requireThreadId(started);

    const conversation = await methods.getConvo(userId, threadId);
    expect(conversation).toMatchObject({
      conversationId: threadId,
      endpoint: EModelEndpoint.agents,
      subagentThread: {
        parentConversationId,
        subagentType: 'research_team',
        subagentKind: 'graph',
        depth: 1,
        userRunnable: false,
      },
    });
    expect(conversation?.agent_id).toBeUndefined();
  });

  it('marks an ephemeral self child as view-only for ordinary user turns', async () => {
    const userId = 'user-ephemeral-self';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });

    const started = store.start(
      taskRequest(config.scopeId, {
        parentAgentId: 'openAI__gpt-5___GPT-5',
        subagentKind: 'agent',
        subagentType: 'self',
      }),
    );
    await waitForSettled(store, config.scopeId, started);
    if (!started.accepted) return;

    const conversation = await methods.getConvo(userId, requireThreadId(started));
    expect(conversation).toMatchObject({
      agent_id: 'openAI__gpt-5___GPT-5',
      subagentThread: {
        subagentKind: 'agent',
        subagentType: 'self',
        userRunnable: false,
      },
    });
  });

  it('inherits tenant isolation and rejects a cross-tenant thread selector', async () => {
    const userId = 'shared-user-id';
    const parentConversationId = randomUUID();
    const store = new SubagentThreadTaskStore(methods);
    let threadId = '';

    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await saveParent(userId, parentConversationId);
      const config = buildSubagentThreadTaskConfig(store, {
        userId,
        parentConversationId,
        tenantId: 'tenant-a',
      });
      const started = store.start(taskRequest(config.scopeId));
      await waitForSettled(store, config.scopeId, started);
      if (!started.accepted) return;
      threadId = requireThreadId(started);
      expect(await methods.getConvo(userId, threadId)).toMatchObject({ tenantId: 'tenant-a' });
    });

    await tenantStorage.run({ tenantId: 'tenant-b' }, async () => {
      expect(await methods.getConvo(userId, threadId)).toBeNull();
      const foreignConfig = buildSubagentThreadTaskConfig(store, {
        userId,
        parentConversationId,
        tenantId: 'tenant-b',
      });
      const run = jest.fn(taskRequest(foreignConfig.scopeId).run);
      const foreign = store.start(
        taskRequest(foreignConfig.scopeId, {
          threadId,
          run,
        }),
      );
      await waitForSettled(store, foreignConfig.scopeId, foreign);
      expect(run).not.toHaveBeenCalled();
      if (!foreign.accepted) return;
      expect(store.claim(foreignConfig.scopeId, foreign.task.taskId)).toMatchObject({
        status: 'error',
      });
    });
  });

  it('continues a completed thread with a fresh task and restored canonical history', async () => {
    const userId = 'user-2';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;

    let restored: BaseMessage[] = [];
    const secondInput = 'Now compare the alternatives.';
    const second = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: secondInput,
        run: async (_runtime, initialMessages = []) => {
          restored = initialMessages;
          const messages = [
            ...initialMessages,
            new HumanMessage(secondInput),
            new AIMessage('Comparison complete.'),
          ];
          return { content: 'Comparison complete.', messages };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, second);
    if (!second.accepted) return;

    expect(second.task.taskId).not.toBe(first.task.taskId);
    expect(second.task.threadId).toBe(first.task.threadId);
    expect(restored.map((message) => message.content)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
    ]);
    const messages = await methods.getMessages(
      { user: userId, conversationId: first.task.threadId },
      '+subagentTranscript',
    );
    expect(messages.map((message) => message.text)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
      secondInput,
      'Comparison complete.',
    ]);
    expect(messages[3].subagentTranscript?.mode).toBe('append');
  });

  it('keeps a runnable child writable when continuation setup fails before input persistence', async () => {
    const userId = 'user-setup-failure';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const initialStore = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(initialStore, { userId, parentConversationId });
    const first = initialStore.start(taskRequest(config.scopeId));
    await waitForSettled(initialStore, config.scopeId, first);
    if (!first.accepted) return;
    const threadId = requireThreadId(first);
    expect(await methods.getConvo(userId, threadId)).toMatchObject({
      subagentThread: { userRunnable: true },
    });

    const failingStore = new SubagentThreadTaskStore({
      ...methods,
      getMessages: jest.fn().mockRejectedValue(new Error('transcript read failed')),
    });
    const failedConfig = buildSubagentThreadTaskConfig(failingStore, {
      userId,
      parentConversationId,
    });
    const failed = failingStore.start(
      taskRequest(failedConfig.scopeId, {
        threadId,
        input: 'This continuation cannot be prepared.',
      }),
    );
    await waitForSettled(failingStore, failedConfig.scopeId, failed);

    expect(await methods.getConvo(userId, threadId)).toMatchObject({
      subagentThread: { userRunnable: true },
    });
    expect(failingStore.isThreadActive(failedConfig.scopeId, threadId)).toBe(false);
    if (!failed.accepted) return;
    expect(failingStore.claim(failedConfig.scopeId, failed.task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('removes a newly created child when setup cannot commit its first input', async () => {
    const userId = 'user-initial-setup-failure';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const failingStore = new SubagentThreadTaskStore({
      ...methods,
      getMessages: jest.fn().mockRejectedValue(new Error('initial transcript read failed')),
    });
    const config = buildSubagentThreadTaskConfig(failingStore, { userId, parentConversationId });
    const failed = failingStore.start(taskRequest(config.scopeId));
    await waitForSettled(failingStore, config.scopeId, failed);
    if (!failed.accepted) return;
    const threadId = requireThreadId(failed);

    expect(await methods.getConvo(userId, threadId)).toBeNull();
    expect(await methods.getMessages({ user: userId, conversationId: threadId })).toEqual([]);
    expect(failingStore.claim(config.scopeId, failed.task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('folds ordinary child-chat turns into the next parent-driven continuation', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;

    const manualUserId = randomUUID();
    const manualAssistantId = randomUUID();
    const manualAttachmentId = randomUUID();
    await methods.createFile({
      file_id: 'manual-file',
      user: new mongoose.Types.ObjectId(userId),
      filename: 'brief.txt',
      filepath: '/uploads/brief.txt',
      type: 'text/plain',
      bytes: 32,
      source: FileSources.text,
      text: 'The launch code is ORBIT-7.',
    });
    await methods.createFile({
      file_id: 'foreign-file',
      user: new mongoose.Types.ObjectId(),
      filename: 'foreign.txt',
      filepath: '/uploads/foreign.txt',
      type: 'text/plain',
      bytes: 40,
      source: FileSources.text,
      text: 'This cross-owner secret must not be restored.',
    });
    await methods.saveMessage(
      { userId },
      {
        messageId: manualUserId,
        conversationId: first.task.threadId,
        parentMessageId: `${first.task.taskId}:assistant`,
        sender: 'User',
        text: '',
        content: [
          { type: 'text', text: 'A human continued this child chat.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
        quotes: ['Quoted child context.'],
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: true,
      },
    );
    await methods.saveMessage(
      { userId },
      {
        messageId: manualAssistantId,
        conversationId: first.task.threadId,
        parentMessageId: manualUserId,
        sender: 'researcher-agent',
        text: 'The child answered the human.',
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
      },
    );
    await methods.saveMessage(
      { userId },
      {
        messageId: manualAttachmentId,
        conversationId: first.task.threadId,
        parentMessageId: manualAssistantId,
        sender: 'User',
        text: '',
        files: [
          { file_id: 'manual-file', filename: 'brief.txt' },
          { file_id: 'foreign-file', filename: 'foreign.txt' },
        ],
        attachments: [{ conversationId: first.task.threadId, filename: 'brief.txt' }],
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: true,
      },
    );

    let restored: BaseMessage[] = [];
    const continued = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: 'Return to the parent task.',
        run: async (_runtime, initialMessages = []) => {
          restored = initialMessages;
          return {
            content: 'Returned.',
            messages: [
              ...initialMessages,
              new HumanMessage('Return to the parent task.'),
              new AIMessage('Returned.'),
            ],
          };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, continued);
    if (!continued.accepted) return;

    expect(restored).toHaveLength(5);
    expect(restored.slice(0, 2).map((message) => message.content)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
    ]);
    expect(restored[2].content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Quoted child context.'),
      }),
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
    expect(restored[3].content).toBe('The child answered the human.');
    expect(restored[4].content).toContain('Attached document(s):');
    expect(restored[4].content).toContain('The launch code is ORBIT-7.');
    expect(restored[4].content).not.toContain('cross-owner secret');
    expect(restored[4].content).not.toBe(ATTACHMENT_ONLY_TEXT);

    const afterFirstContinuation = await methods.getMessages(
      { user: userId, conversationId: first.task.threadId },
      '+subagentTranscript',
    );
    expect(
      afterFirstContinuation[afterFirstContinuation.length - 1]?.subagentTranscript?.mode,
    ).toBe('replace');

    let restoredAgain: BaseMessage[] = [];
    const continuedAgain = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: 'One more follow-up.',
        run: async (_runtime, initialMessages = []) => {
          restoredAgain = initialMessages;
          return {
            content: 'Follow-up complete.',
            messages: [
              ...initialMessages,
              new HumanMessage('One more follow-up.'),
              new AIMessage('Follow-up complete.'),
            ],
          };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, continuedAgain);

    expect(restoredAgain).toHaveLength(7);
    expect(restoredAgain[2].content).toEqual(restored[2].content);
    expect(restoredAgain.map((message) => message.content).slice(3)).toEqual([
      'The child answered the human.',
      restored[4].content,
      'Return to the parent task.',
      'Returned.',
    ]);
  });

  it('restores persisted Gemini thought signatures from ordinary child turns', async () => {
    const userId = 'user-thought-signatures';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;

    const manualUserId = randomUUID();
    await methods.saveMessage(
      { userId },
      {
        messageId: manualUserId,
        conversationId: first.task.threadId,
        parentMessageId: `${first.task.taskId}:assistant`,
        sender: 'User',
        text: 'Run the signed tool step.',
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: true,
      },
    );
    await methods.saveMessage(
      { userId },
      {
        messageId: randomUUID(),
        conversationId: first.task.threadId,
        parentMessageId: manualUserId,
        sender: 'researcher-agent',
        text: '',
        content: [
          { type: 'text', text: '', tool_call_ids: ['signed-call'] },
          {
            type: 'tool_call',
            tool_call: {
              id: 'signed-call',
              name: 'lookup',
              args: '{}',
              output: 'signed result',
            },
          },
        ],
        metadata: { thoughtSignatures: { 'signed-call': 'gemini-signature' } },
        endpoint: EModelEndpoint.agents,
        isCreatedByUser: false,
      },
    );

    let restored: BaseMessage[] = [];
    const continued = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: 'Continue after the signed step.',
        run: async (_runtime, initialMessages = []) => {
          restored = initialMessages;
          return {
            content: 'Continued.',
            messages: [
              ...initialMessages,
              new HumanMessage('Continue after the signed step.'),
              new AIMessage('Continued.'),
            ],
          };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, continued);

    const signedMessage = restored.find(
      (message) =>
        message instanceof AIMessage &&
        message.tool_calls?.some((call) => call.id === 'signed-call'),
    );
    expect(signedMessage?.additional_kwargs.signatures).toEqual(['gemini-signature']);
  });

  it('persists a compacted canonical replacement without replaying superseded history', async () => {
    const userId = 'user-compaction';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;

    const compactedMessages: BaseMessage[] = [
      new HumanMessage('Condensed prior work.'),
      new AIMessage('Compact state.'),
      new HumanMessage('Continue from the compact state.'),
      new AIMessage('Compacted continuation complete.'),
    ];
    const second = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: 'Continue from the compact state.',
        run: async () => ({
          content: 'Compacted continuation complete.',
          messages: compactedMessages,
        }),
      }),
    );
    await waitForSettled(store, config.scopeId, second);
    if (!second.accepted) return;

    let restored: BaseMessage[] = [];
    const third = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: 'One more turn.',
        run: async (_runtime, initialMessages = []) => {
          restored = initialMessages;
          return {
            content: 'Done.',
            messages: [
              ...initialMessages,
              new HumanMessage('One more turn.'),
              new AIMessage('Done.'),
            ],
          };
        },
      }),
    );
    await waitForSettled(store, config.scopeId, third);

    expect(restored.map((message) => message.content)).toEqual(
      compactedMessages.map((message) => message.content),
    );
    const messages = await methods.getMessages(
      { user: userId, conversationId: first.task.threadId },
      '+subagentTranscript',
    );
    expect(
      messages.find((message) => message.messageId === `${second.task.taskId}:assistant`)
        ?.subagentTranscript?.mode,
    ).toBe('replace');
  });

  it('holds the thread lease through cancellation and never persists a late success', async () => {
    const userId = 'user-cancel';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;

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
        threadId: first.task.threadId,
        input: 'Long child turn.',
        run: async () => {
          markEntered();
          return lateResult;
        },
      }),
    );
    if (!cancelled.accepted) return;
    await entered;
    expect(store.control(config.scopeId, cancelled.task.taskId, { action: 'cancel' }).status).toBe(
      'cancelled',
    );

    const overlapping = store.start(
      taskRequest(config.scopeId, {
        threadId: first.task.threadId,
        input: 'Must not overlap.',
      }),
    );
    expect(overlapping).toEqual({ accepted: false, reason: 'capacity' });

    finishLate({
      content: 'Late success must be discarded.',
      messages: [new AIMessage('Late success must be discarded.')],
    });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const next = store.start(
        taskRequest(config.scopeId, {
          threadId: first.task.threadId,
          input: 'Safe next turn.',
        }),
      );
      if (next.accepted) {
        await waitForSettled(store, config.scopeId, next);
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      if (attempt === 199) {
        throw new Error('Cancelled child-thread lease was not released after executor exit.');
      }
    }

    const messages = await methods.getMessages({
      user: userId,
      conversationId: first.task.threadId,
    });
    expect(messages.map((message) => message.text)).not.toContain(
      'Late success must be discarded.',
    );
    expect(messages.map((message) => message.text)).toContain('Subagent task was cancelled.');
    expect(messages.some((message) => message.error === true)).toBe(false);
  });

  it('lets durable settlement win once a successful commit has started', async () => {
    const userId = 'user-commit-race';
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
        const message = args[1];
        if (message.text === 'Committed result.') {
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
          messages: [
            new HumanMessage('Investigate the issue.'),
            new AIMessage('Committed result.'),
          ],
        }),
      }),
    );
    if (!started.accepted) return;
    await commitStarted;

    expect(store.control(config.scopeId, started.task.taskId, { action: 'cancel' })).toMatchObject({
      status: 'not_running',
    });
    releaseCommit();
    await waitForSettled(store, config.scopeId, started);

    expect(store.claim(config.scopeId, started.task.taskId)).toMatchObject({
      status: 'completed',
      result: 'Committed result.',
    });
    const messages = await methods.getMessages({
      user: userId,
      conversationId: requireThreadId(started),
    });
    expect(messages.map((message) => message.text)).toContain('Committed result.');
    expect(messages.map((message) => message.text)).not.toContain('Subagent task was cancelled.');
  });

  it('fails closed for unknown and cross-parent continuation selectors', async () => {
    const userId = 'user-3';
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
    const run = jest.fn(taskRequest(firstConfig.scopeId).run);

    const unknown = store.start(taskRequest(firstConfig.scopeId, { threadId: randomUUID(), run }));
    await waitForSettled(store, firstConfig.scopeId, unknown);
    expect(run).not.toHaveBeenCalled();
    if (!unknown.accepted) return;
    expect(store.claim(firstConfig.scopeId, unknown.task.taskId)).toMatchObject({
      status: 'error',
    });

    const created = store.start(taskRequest(firstConfig.scopeId));
    await waitForSettled(store, firstConfig.scopeId, created);
    if (!created.accepted) return;
    const crossParentRun = jest.fn(taskRequest(secondConfig.scopeId).run);
    const crossParent = store.start(
      taskRequest(secondConfig.scopeId, {
        threadId: created.task.threadId,
        run: crossParentRun,
      }),
    );
    await waitForSettled(store, secondConfig.scopeId, crossParent);
    expect(crossParentRun).not.toHaveBeenCalled();
    if (!crossParent.accepted) return;
    expect(store.claim(secondConfig.scopeId, crossParent.task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('binds continuation to the invoking parent agent and child execution shape', async () => {
    const userId = 'user-lineage';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const created = store.start(
      taskRequest(config.scopeId, {
        parentAgentId: 'agent-a',
        subagentKind: 'agent',
        subagentType: 'self',
      }),
    );
    await waitForSettled(store, config.scopeId, created);
    if (!created.accepted) return;

    for (const overrides of [
      { parentAgentId: 'agent-b', subagentKind: 'agent' as const, subagentType: 'self' },
      { parentAgentId: 'agent-a', subagentKind: 'graph' as const, subagentType: 'self' },
      { parentAgentId: 'agent-a', subagentKind: 'agent' as const, subagentType: 'researcher' },
    ]) {
      const run = jest.fn(taskRequest(config.scopeId).run);
      const rejected = store.start(
        taskRequest(config.scopeId, {
          threadId: created.task.threadId,
          run,
          ...overrides,
        }),
      );
      await waitForSettled(store, config.scopeId, rejected);
      expect(run).not.toHaveBeenCalled();
      if (!rejected.accepted) continue;
      expect(store.claim(config.scopeId, rejected.task.taskId)).toMatchObject({
        status: 'error',
      });
    }

    await methods.saveConvo(
      { userId },
      {
        conversationId: requireThreadId(created),
        endpoint: EModelEndpoint.agents,
        title: 'Changed child identity',
        agent_id: 'different-child-agent',
      },
      { noUpsert: true },
    );
    const changedIdentityRun = jest.fn(taskRequest(config.scopeId).run);
    const changedIdentity = store.start(
      taskRequest(config.scopeId, {
        threadId: requireThreadId(created),
        run: changedIdentityRun,
      }),
    );
    await waitForSettled(store, config.scopeId, changedIdentity);
    expect(changedIdentityRun).not.toHaveBeenCalled();
    if (!changedIdentity.accepted) return;
    expect(store.claim(config.scopeId, changedIdentity.task.taskId)).toMatchObject({
      status: 'error',
    });
  });

  it('does not persist arbitrary executor error details into the visible child chat', async () => {
    loggerErrorSpy.mockClear();
    const userId = 'user-safe-error';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          throw new Error('Parent thread is unavailable. Authorization: Bearer provider-secret');
        },
      }),
    );
    await waitForSettled(store, config.scopeId, started);
    if (!started.accepted) return;
    const threadId = requireThreadId(started);

    const messages = await methods.getMessages({
      user: userId,
      conversationId: threadId,
    });
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage?.text).toBe('Subagent task failed: The child run could not be completed.');
    expect(lastMessage?.text).not.toContain('provider-secret');
    const claim = store.claim(config.scopeId, started.task.taskId);
    expect(claim).toMatchObject({
      status: 'error',
      error: 'The child run could not be completed.',
    });
    expect(JSON.stringify(claim)).not.toContain('provider-secret');
    expect(JSON.stringify(loggerErrorSpy.mock.calls)).not.toContain('provider-secret');
  });

  it('retries the required writability restore after a failed child run', async () => {
    const userId = 'user-failure-restore-retry';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    let runnableAttempts = 0;
    const retryingMethods = {
      ...methods,
      saveConvo: jest.fn(async (...args: Parameters<AllMethods['saveConvo']>) => {
        if (args[1]['subagentThread.userRunnable'] === true) {
          runnableAttempts += 1;
          if (runnableAttempts === 1) {
            throw new Error('transient writability update failure');
          }
        }
        return methods.saveConvo(...args);
      }),
    };
    const store = new SubagentThreadTaskStore(retryingMethods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const started = store.start(
      taskRequest(config.scopeId, {
        run: async () => {
          throw new Error('child failed');
        },
      }),
    );
    await waitForSettled(store, config.scopeId, started);
    if (!started.accepted) return;

    expect(runnableAttempts).toBeGreaterThanOrEqual(2);
    expect(await methods.getConvo(userId, requireThreadId(started))).toMatchObject({
      subagentThread: { userRunnable: true },
    });
    expect(store.claim(config.scopeId, started.task.taskId)).toMatchObject({ status: 'error' });
  });

  it('bounds durable delegation depth to one by default', async () => {
    const userId = 'user-4';
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
        userRunnable: true,
      },
    });
    const store = new SubagentThreadTaskStore(methods);
    expect(store.canCreateChildThread(0)).toBe(true);
    expect(store.canCreateChildThread(1)).toBe(false);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const run = jest.fn(taskRequest(config.scopeId).run);

    const started = store.start(taskRequest(config.scopeId, { run }));
    await waitForSettled(store, config.scopeId, started);
    expect(run).not.toHaveBeenCalled();
    if (!started.accepted) return;
    expect(store.claim(config.scopeId, started.task.taskId)).toMatchObject({ status: 'error' });
    expect(await methods.getConvo(userId, requireThreadId(started))).toBeNull();
  });
});
