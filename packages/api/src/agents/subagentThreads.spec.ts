import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { EModelEndpoint } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AIMessage, HumanMessage } from '@librechat/agents/langchain/messages';
import { createMethods, createModels, logger, tenantStorage } from '@librechat/data-schemas';
import type {
  SubagentTaskRuntime,
  SubagentTaskStartRequest,
  SubagentTaskStartResult,
} from '@librechat/agents';
import type { AllMethods, IConversation, IMessage } from '@librechat/data-schemas';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import { buildSubagentThreadTaskConfig, SubagentThreadTaskStore } from './subagentThreads';

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
      },
    });
    expect(conversation?.agent_id).toBeUndefined();
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

  it('folds ordinary child-chat turns into the next parent-driven continuation', async () => {
    const userId = 'user-manual';
    const parentConversationId = randomUUID();
    await saveParent(userId, parentConversationId);
    const store = new SubagentThreadTaskStore(methods);
    const config = buildSubagentThreadTaskConfig(store, { userId, parentConversationId });
    const first = store.start(taskRequest(config.scopeId));
    await waitForSettled(store, config.scopeId, first);
    if (!first.accepted) return;

    const manualUserId = randomUUID();
    const manualAssistantId = randomUUID();
    await methods.saveMessage(
      { userId },
      {
        messageId: manualUserId,
        conversationId: first.task.threadId,
        parentMessageId: `${first.task.taskId}:assistant`,
        sender: 'User',
        text: 'A human continued this child chat.',
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

    expect(restored.map((message) => message.content)).toEqual([
      'Investigate the issue.',
      'Completed the investigation.',
      'A human continued this child chat.',
      'The child answered the human.',
    ]);
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
      },
    });
    const store = new SubagentThreadTaskStore(methods);
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
