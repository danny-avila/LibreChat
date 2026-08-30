import type { EnqueueBackgroundToolCompletion } from './backgroundCompletionWakeup';
import {
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolCompletionWakeupResolver,
} from './backgroundCompletionWakeup';
import { parseAgentTriggerEnvelope } from './triggers/envelope';

const NOW = Date.parse('2026-08-30T12:00:00Z');

function registration(overrides = {}) {
  return {
    taskId: 'task-1',
    toolCallId: 'call-1',
    toolName: 'slow_tool',
    userId: 'user-1',
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    parentMessageId: 'response-1',
    parentAgentId: 'agent_parent_1',
    createdAt: NOW - 10,
    ...overrides,
  };
}

function envelope() {
  let value: unknown;
  const notify = createBackgroundToolCompletionWakeupHandler(
    async (next) => {
      value = next;
      return { deliveryKey: 'delivery-key-1' };
    },
    async () => true,
  );
  return notify(registration()).then(() => {
    const parsed = parseAgentTriggerEnvelope(value);
    if (parsed.mode !== 'continue') {
      throw new Error('Expected a continue envelope');
    }
    return parsed;
  });
}

function resolverMethods() {
  const releaseBackgroundToolResultClaims = jest.fn(async () => true);
  return {
    releaseBackgroundToolResultClaims,
    methods: {
      getConvo: jest.fn(async () => ({ tenantId: 'tenant-1' })),
      getMessages: jest.fn(async () => [
        {
          messageId: 'response-1',
          parentMessageId: 'user-1',
          isCreatedByUser: false,
          createdAt: new Date(NOW - 5),
        },
        {
          messageId: 'response-2',
          parentMessageId: 'response-1',
          isCreatedByUser: false,
          createdAt: new Date(NOW),
        },
      ]),
      claimBackgroundToolResults: jest.fn(async () => ({
        status: 'acquired',
        results: [
          {
            taskId: 'task-1',
            toolCallId: 'call-1',
            toolName: 'slow_tool',
            status: 'completed',
            output: 'done',
          },
          {
            taskId: 'task-2',
            toolCallId: 'call-2',
            toolName: 'other_tool',
            status: 'error',
            output: 'failed safely',
          },
        ],
      })),
      releaseBackgroundToolResultClaims,
    },
  };
}

describe('background tool completion wakeups', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pre-registers the exact task on the invoking response branch', async () => {
    const enqueue = jest.fn<
      ReturnType<EnqueueBackgroundToolCompletion>,
      Parameters<EnqueueBackgroundToolCompletion>
    >(async () => ({ deliveryKey: 'delivery-key-1' }));
    const retire = jest.fn(async () => true);
    const notify = createBackgroundToolCompletionWakeupHandler(enqueue, retire);

    const admission = await notify(registration());
    expect(admission).not.toBe(false);

    const [value, options] = enqueue.mock.calls[0]!;
    expect(parseAgentTriggerEnvelope(value)).toMatchObject({
      deliveryId: 'task-1',
      principal: { userId: 'user-1', tenantId: 'tenant-1' },
      target: {
        agentId: 'agent_parent_1',
        conversationId: 'conversation-1',
        parentMessageId: 'response-1',
      },
      event: {
        type: 'background-tool.completion',
        source: { id: 'background-tool-completion', type: 'internal' },
        payload: { taskId: 'task-1', toolCallId: 'call-1', toolName: 'slow_tool' },
      },
    });
    expect(options).toEqual({
      orderingKey: 'background-tool-completion:conversation-1:task-1',
      availableAt: new Date(NOW + 250),
    });
    if (admission !== false) {
      await expect(admission.retire('result unavailable')).resolves.toBe(true);
    }
    expect(retire).toHaveBeenCalledWith(
      'delivery-key-1',
      'background-tool-completion',
      'result unavailable',
    );
    if (admission !== false) {
      await expect(
        admission.retire('manual poll elected', { onlyIfUnclaimed: true }),
      ).resolves.toBe(true);
    }
    expect(retire).toHaveBeenLastCalledWith(
      'delivery-key-1',
      'background-tool-completion',
      'manual poll elected',
      { onlyIfUnclaimed: true },
    );
  });

  it("keeps unfinished sibling tasks out of each other's delivery lanes", async () => {
    const enqueue = jest.fn<
      ReturnType<EnqueueBackgroundToolCompletion>,
      Parameters<EnqueueBackgroundToolCompletion>
    >(async () => ({ deliveryKey: 'delivery-key' }));
    const notify = createBackgroundToolCompletionWakeupHandler(enqueue, async () => true);

    await notify(registration({ taskId: 'task-slow' }));
    await notify(registration({ taskId: 'task-fast' }));

    expect(enqueue.mock.calls.map(([, options]) => options?.orderingKey)).toEqual([
      'background-tool-completion:conversation-1:task-slow',
      'background-tool-completion:conversation-1:task-fast',
    ]);
  });

  it('reports skipped registration for an ephemeral invoking agent', async () => {
    const enqueue = jest.fn(async () => ({ deliveryKey: 'delivery-key-1' }));
    const retire = jest.fn(async () => true);
    const notify = createBackgroundToolCompletionWakeupHandler(enqueue, retire);

    await expect(notify(registration({ parentAgentId: 'ephemeral-agent' }))).resolves.toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('claims a bounded sibling batch and continues from the latest branch leaf', async () => {
    const { methods } = resolverMethods();
    const resolve = createBackgroundToolCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    const prepared = await resolve(await envelope(), { idempotencyKey: 'delivery-1' });

    expect(prepared).toMatchObject({ status: 'ready', parentMessageId: 'response-2' });
    expect(prepared?.status === 'ready' && prepared.input).toContain('task-2');
    expect(methods.claimBackgroundToolResults).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'response-1',
        taskId: 'task-1',
        kind: 'wakeup',
        claimId: 'delivery-1',
      }),
    );
  });

  it('releases every claimed sibling when admission definitely fails', async () => {
    const { methods, releaseBackgroundToolResultClaims } = resolverMethods();
    const resolve = createBackgroundToolCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });
    const prepared = await resolve(await envelope(), { idempotencyKey: 'delivery-1' });

    expect(prepared?.status).toBe('ready');
    if (prepared?.status === 'ready') {
      await prepared.releaseOnDefiniteFailure?.();
    }
    expect(releaseBackgroundToolResultClaims).toHaveBeenCalledWith(
      expect.objectContaining({ taskIds: ['task-1', 'task-2'], claimId: 'delivery-1' }),
    );
  });

  it('defers without claiming while the invoking generation is active', async () => {
    const { methods } = resolverMethods();
    const resolve = createBackgroundToolCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => ({ status: 'running' }),
    });

    await expect(resolve(await envelope(), { idempotencyKey: 'delivery-1' })).rejects.toMatchObject(
      {
        code: 'PARENT_NOT_READY',
        deferWithoutAttempt: true,
      },
    );
    expect(methods.claimBackgroundToolResults).not.toHaveBeenCalled();
  });
});
