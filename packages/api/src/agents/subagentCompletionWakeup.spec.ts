import type { IMessage } from '@librechat/data-schemas';
import type { AgentContinueTriggerEnvelope } from './triggers/envelope';
import type { SubagentTaskWakeupRegistration } from './subagentThreads';
import type { EnqueueAgentTrigger } from './subagentCompletionWakeup';
import {
  createAgentTriggerEnvelope,
  getAgentTriggerIdempotencyKey,
  parseAgentTriggerEnvelope,
} from './triggers/envelope';
import {
  createSubagentCompletionWakeupHandler,
  createSubagentCompletionWakeupResolver,
} from './subagentCompletionWakeup';

const NOW = 1_775_000_000_000;

function enqueueMock(): jest.MockedFunction<EnqueueAgentTrigger> {
  return jest.fn<ReturnType<EnqueueAgentTrigger>, Parameters<EnqueueAgentTrigger>>(async () => ({
    id: 'delivery-1',
  }));
}

function registration(
  overrides: Partial<SubagentTaskWakeupRegistration> = {},
): SubagentTaskWakeupRegistration {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    parentConversationId: 'conversation-1',
    parentMessageId: 'response-1',
    parentAgentId: 'agent_parent_1',
    taskId: 'task-1',
    threadId: 'thread-1',
    subagentType: 'researcher',
    createdAt: NOW - 10,
    ...overrides,
  };
}

describe('createSubagentCompletionWakeupHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pre-registers a bounded continuation on the exact parent branch', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);

    await notify(registration());

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [envelopeValue, options] = enqueue.mock.calls[0]!;
    const envelope = parseAgentTriggerEnvelope(envelopeValue);
    expect(envelope).toMatchObject({
      version: 1,
      mode: 'continue',
      principal: { userId: 'user-1', tenantId: 'tenant-1' },
      target: {
        agentId: 'agent_parent_1',
        conversationId: 'conversation-1',
        parentMessageId: 'response-1',
      },
      event: {
        id: 'task-1',
        type: 'subagent.completion',
        source: { id: 'subagent-completion', type: 'internal' },
        payload: {
          taskId: 'task-1',
          threadId: 'thread-1',
          subagentType: 'researcher',
        },
      },
    });
    expect(envelope.input).toContain('waiting to complete');
    expect(options).toEqual({
      orderingKey: 'subagent-completion:conversation-1',
      availableAt: new Date(NOW + 250),
    });
  });

  it('keeps one idempotency identity across duplicate registration callbacks', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);
    const event = registration();

    await notify(event);
    await notify(event);

    const first = parseAgentTriggerEnvelope(enqueue.mock.calls[0]![0]);
    const retry = parseAgentTriggerEnvelope(enqueue.mock.calls[1]![0]);
    expect(first.requestId).not.toBe(retry.requestId);
    expect(first.deliveryId).toBe('task-1');
    expect(getAgentTriggerIdempotencyKey(first)).toBe(getAgentTriggerIdempotencyKey(retry));
    expect(first.input).toContain('waiting to complete');
  });

  it('does not enqueue without a stable initiating agent', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);

    await notify(registration({ parentAgentId: undefined }));

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue for an ephemeral initiating agent', async () => {
    const enqueue = enqueueMock();
    const notify = createSubagentCompletionWakeupHandler(enqueue);

    await notify(registration({ parentAgentId: 'openAI__gpt-4o___GPT-4o____1' }));

    expect(enqueue).not.toHaveBeenCalled();
  });
});

function wakeupEnvelope(): AgentContinueTriggerEnvelope {
  const envelope = createAgentTriggerEnvelope({
    mode: 'continue',
    requestId: 'request-1',
    deliveryId: 'task-1',
    receivedAt: NOW,
    principal: { id: 'user-1', tenantId: 'tenant-1' },
    event: {
      id: 'task-1',
      type: 'subagent.completion',
      occurredAt: NOW,
      source: { id: 'subagent-completion', type: 'internal' },
      payload: { taskId: 'task-1', threadId: 'thread-1', subagentType: 'researcher' },
    },
    target: {
      agentId: 'agent_parent_1',
      conversationId: 'conversation-1',
      parentMessageId: 'response-1',
    },
    input: 'pending',
  });
  if (envelope.mode !== 'continue') {
    throw new Error('Expected a continue envelope.');
  }
  return envelope;
}

function resolverMethods() {
  const subagentTask: IMessage['subagentTask'] = {
    attemptKey: 'attempt-1',
    parentRunId: 'response-1',
    status: 'completed',
  };
  const terminal = {
    messageId: 'task-1:assistant',
    conversationId: 'thread-1',
    parentMessageId: 'task-1:user',
    sender: 'researcher',
    text: 'Child result',
    isCreatedByUser: false,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    subagentTask,
  };
  const methods = {
    getConvo: jest.fn(async (_userId: string, conversationId: string) =>
      conversationId === 'conversation-1'
        ? { conversationId, tenantId: 'tenant-1' }
        : {
            conversationId,
            tenantId: 'tenant-1',
            subagentThread: {
              parentConversationId: 'conversation-1',
              parentMessageId: 'response-1',
              parentAgentId: 'agent_parent_1',
              subagentType: 'researcher',
            },
          },
    ),
    getMessages: jest.fn(async (filter: { conversationId: string }) =>
      filter.conversationId === 'conversation-1'
        ? [
            {
              messageId: 'response-1',
              parentMessageId: 'user-1',
              isCreatedByUser: false,
              createdAt: new Date(NOW - 30),
            },
            {
              messageId: 'wakeup-user',
              parentMessageId: 'response-1',
              isCreatedByUser: true,
              createdAt: new Date(NOW - 20),
            },
            {
              messageId: 'wakeup-response',
              parentMessageId: 'wakeup-user',
              isCreatedByUser: false,
              createdAt: new Date(NOW - 10),
            },
          ]
        : [
            {
              messageId: 'task-1:user',
              conversationId: 'thread-1',
              isCreatedByUser: true,
            },
            terminal,
          ],
    ),
    claimSubagentTaskResult: jest.fn(async () => ({ status: 'acquired', message: terminal })),
    releaseSubagentTaskResultClaim: jest.fn(async () => true),
  };
  return { methods, terminal };
}

describe('createSubagentCompletionWakeupResolver', () => {
  it('defers without claiming while the parent generation is active', async () => {
    const { methods } = resolverMethods();
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => ({ status: 'running' }),
    });

    await expect(
      resolve(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).rejects.toMatchObject({
      code: 'PARENT_NOT_READY',
      retryable: true,
      deferWithoutAttempt: true,
    });
    expect(methods.claimSubagentTaskResult).not.toHaveBeenCalled();
  });

  it('lets a lost-receipt retry reach HTTP dedup for its own active continuation', async () => {
    const { methods } = resolverMethods();
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => ({
        status: 'requires_action',
        metadata: { idempotencyClientRequestId: 'trigger_claim_1' },
      }),
    });

    await expect(
      resolve(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).resolves.toMatchObject({ status: 'ready' });
  });

  it('bounds a persisted child result before rendering model input', async () => {
    const { methods, terminal } = resolverMethods();
    terminal.text = 'x'.repeat(200_000);
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    const prepared = await resolve(wakeupEnvelope(), {
      idempotencyKey: 'trigger_claim_1',
    } as never);

    expect(prepared).toMatchObject({ status: 'ready' });
    expect(prepared?.status === 'ready' && prepared.input.length).toBeLessThan(110_000);
  });

  it('dead-letters a child whose process disappeared after the task timeout grace', async () => {
    const { methods } = resolverMethods();
    methods.getMessages.mockImplementation(async (filter: { conversationId: string }) =>
      filter.conversationId === 'conversation-1'
        ? [
            {
              messageId: 'response-1',
              parentMessageId: 'user-1',
              isCreatedByUser: false,
              createdAt: new Date(NOW - 30),
            },
          ]
        : [
            {
              messageId: 'task-1:user',
              conversationId: 'thread-1',
              isCreatedByUser: true,
            },
          ],
    );
    const fresh = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
      now: () => NOW + 60_000,
    });
    const stale = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
      now: () => NOW + 36 * 60_000,
    });

    await expect(
      fresh(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).rejects.toMatchObject({
      code: 'CHILD_NOT_READY',
      retryable: true,
      deferWithoutAttempt: true,
    });
    await expect(
      stale(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).rejects.toMatchObject({ code: 'CHILD_TASK_ABANDONED', retryable: false, status: 410 });
    expect(methods.claimSubagentTaskResult).not.toHaveBeenCalled();
    expect(
      methods.getMessages.mock.calls.filter(
        ([filter]) => filter.conversationId === 'conversation-1',
      ),
    ).toHaveLength(0);
  });

  it('resolves a crash-retry terminal by logical attempt without blocking its ordered lane', async () => {
    const { methods, terminal } = resolverMethods();
    const supersedingTerminal = {
      ...terminal,
      messageId: 'task-2:assistant',
      parentMessageId: 'task-1:user',
    };
    methods.getMessages.mockImplementation(async (filter: Record<string, unknown>) => {
      if (filter.conversationId === 'conversation-1') {
        return [
          {
            messageId: 'response-1',
            parentMessageId: 'user-1',
            isCreatedByUser: false,
            createdAt: new Date(NOW - 30),
          },
        ];
      }
      if (filter['subagentTask.attemptKey'] === 'attempt-1') {
        return [supersedingTerminal];
      }
      return [
        {
          messageId: 'task-1:user',
          conversationId: 'thread-1',
          isCreatedByUser: true,
          subagentTask: {
            attemptKey: 'attempt-1',
            parentRunId: 'response-1',
            status: 'running',
          },
        },
      ];
    });
    methods.claimSubagentTaskResult.mockResolvedValueOnce({
      status: 'acquired',
      message: supersedingTerminal,
    });
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    const prepared = await resolve(wakeupEnvelope(), {
      idempotencyKey: 'trigger_claim_1',
    } as never);

    expect(prepared).toMatchObject({
      status: 'ready',
      input: expect.stringContaining('"background_task_id":"task-2"'),
    });
    expect(methods.claimSubagentTaskResult).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'thread-1',
      taskId: 'task-2',
      kind: 'wakeup',
      claimId: 'trigger_claim_1',
    });
  });

  it('validates a continued child against its per-task parent instead of original lineage', async () => {
    const { methods } = resolverMethods();
    methods.getConvo.mockImplementation(async (_userId: string, conversationId: string) =>
      conversationId === 'conversation-1'
        ? { conversationId, tenantId: 'tenant-1' }
        : {
            conversationId,
            tenantId: 'tenant-1',
            subagentThread: {
              parentConversationId: 'conversation-1',
              parentMessageId: 'original-response',
              parentAgentId: 'agent_parent_1',
              subagentType: 'researcher',
            },
          },
    );
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    await expect(
      resolve(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).resolves.toMatchObject({ status: 'ready' });
  });

  it('claims the durable result and chains onto the latest assistant descendant', async () => {
    const { methods } = resolverMethods();
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    await expect(
      resolve(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).resolves.toMatchObject({
      status: 'ready',
      parentMessageId: 'wakeup-response',
      input: expect.stringContaining('Child result'),
    });
    expect(methods.claimSubagentTaskResult).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'thread-1',
      taskId: 'task-1',
      kind: 'wakeup',
      claimId: 'trigger_claim_1',
    });

    const prepared = await resolve(wakeupEnvelope(), {
      idempotencyKey: 'trigger_claim_1',
    } as never);
    expect(prepared?.status).toBe('ready');
    if (prepared?.status === 'ready') {
      await prepared.releaseOnDefiniteFailure?.();
    }
    expect(methods.releaseSubagentTaskResultClaim).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'thread-1',
      taskId: 'task-1',
      kind: 'wakeup',
      claimId: 'trigger_claim_1',
    });
  });

  it('settles without starting a turn when a manual poll already claimed the result', async () => {
    const { methods, terminal } = resolverMethods();
    methods.claimSubagentTaskResult.mockResolvedValueOnce({
      status: 'claimed',
      message: {
        ...terminal,
        subagentTask: {
          ...terminal.subagentTask,
          resultClaim: { kind: 'manual', claimId: 'poll-1', claimedAt: new Date(NOW) },
        },
      },
    });
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    await expect(
      resolve(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).resolves.toEqual({ status: 'settled' });
  });

  it('releases a cancelled wakeup result for later explicit collection', async () => {
    const { methods, terminal } = resolverMethods();
    terminal.subagentTask = { ...terminal.subagentTask!, status: 'cancelled' };
    methods.claimSubagentTaskResult.mockResolvedValueOnce({
      status: 'acquired',
      message: terminal,
    });
    const resolve = createSubagentCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    await expect(
      resolve(wakeupEnvelope(), { idempotencyKey: 'trigger_claim_1' } as never),
    ).resolves.toEqual({ status: 'settled' });
    expect(methods.releaseSubagentTaskResultClaim).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'thread-1',
      taskId: 'task-1',
      kind: 'wakeup',
      claimId: 'trigger_claim_1',
    });
  });
});
