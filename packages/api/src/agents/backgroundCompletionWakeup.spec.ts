import { AGENT_TRIGGER_WORKER_CAPABILITY_BACKGROUND_COMPLETION_V1 } from '@librechat/data-schemas';
import type { AgentTriggerProducerLeaseStatus } from '@librechat/data-schemas';
import type { EnqueueBackgroundToolCompletion } from './backgroundCompletionWakeup';
import {
  BACKGROUND_TOOL_WAKEUP_INPUT_MAX_CHARS,
  createBackgroundToolCompletionWakeupHandler,
  createBackgroundToolCompletionWakeupResolver,
  createBackgroundToolDeadClaimRecovery,
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

function envelope(registrationOverrides = {}) {
  let value: unknown;
  const notify = createBackgroundToolCompletionWakeupHandler(
    async (next) => {
      value = next;
      return { deliveryKey: 'delivery-key-1' };
    },
    async () => true,
    async () => true,
  );
  return notify(registration(registrationOverrides)).then(() => {
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
      getAgentTriggerDeliveryProducerLease: jest.fn(
        async (): Promise<AgentTriggerProducerLeaseStatus> => ({
          status: 'live',
          leaseUntil: new Date(NOW + 30_000),
        }),
      ),
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
    const renew = jest.fn(async () => true);
    const notify = createBackgroundToolCompletionWakeupHandler(enqueue, retire, renew);

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
      requiredWorkerCapability: AGENT_TRIGGER_WORKER_CAPABILITY_BACKGROUND_COMPLETION_V1,
      producerLeaseUntil: new Date(NOW + 30_000),
    });
    if (admission !== false) {
      await expect(admission.renew()).resolves.toBe(true);
    }
    expect(renew).toHaveBeenCalledWith(
      'delivery-key-1',
      'background-tool-completion',
      new Date(NOW + 30_000),
    );
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
    if (admission !== false) {
      await expect(admission.retire('dead delivery recovered', { onlyIfDead: true })).resolves.toBe(
        true,
      );
    }
    expect(retire).toHaveBeenLastCalledWith(
      'delivery-key-1',
      'background-tool-completion',
      'dead delivery recovered',
      { onlyIfDead: true },
    );
  });

  it('retires the batch-root delivery before releasing all of its sibling claims', async () => {
    const retire = jest.fn(async () => true);
    const release = jest.fn(async () => true);
    const getGenerationJob = jest.fn(async () => ({ status: 'complete' }));
    const fenceGenerationClaim = jest.fn(async () => 'fenced' as const);
    const recover = createBackgroundToolDeadClaimRecovery(
      retire,
      release,
      getGenerationJob,
      fenceGenerationClaim,
    );

    await expect(
      recover({
        userId: 'user-1',
        conversationId: 'conversation-1',
        messageId: 'response-1',
        claimId: 'batch-root-delivery',
      }),
    ).resolves.toBe(true);

    expect(retire).toHaveBeenCalledWith(
      'batch-root-delivery',
      'background-tool-completion',
      'dead background completion batch recovered by manual poll',
      { onlyIfDead: true },
    );
    expect(getGenerationJob).toHaveBeenCalledTimes(2);
    expect(getGenerationJob).toHaveBeenCalledWith('conversation-1');
    expect(fenceGenerationClaim).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      claimId: 'batch-root-delivery',
    });
    expect(release).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'response-1',
      kind: 'wakeup',
      claimId: 'batch-root-delivery',
    });
  });

  it('does not recover a dead delivery while its admitted generation is still active', async () => {
    const retire = jest.fn(async () => true);
    const release = jest.fn(async () => true);
    const fenceGenerationClaim = jest.fn(async () => 'fenced' as const);
    const recover = createBackgroundToolDeadClaimRecovery(
      retire,
      release,
      async () => ({
        status: 'running',
        metadata: { idempotencyClientRequestId: 'batch-root-delivery' },
      }),
      fenceGenerationClaim,
    );

    await expect(
      recover({
        userId: 'user-1',
        conversationId: 'conversation-1',
        messageId: 'response-1',
        claimId: 'batch-root-delivery',
      }),
    ).resolves.toBe(false);
    expect(retire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(fenceGenerationClaim).not.toHaveBeenCalled();
  });

  it('rechecks a generation published while its dead delivery is being retired', async () => {
    const retire = jest.fn(async () => true);
    const release = jest.fn(async () => true);
    const getGenerationJob = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        status: 'running',
        metadata: { idempotencyClientRequestId: 'batch-root-delivery' },
      })
      .mockResolvedValue({ status: 'complete' });
    const fenceGenerationClaim = jest
      .fn()
      .mockResolvedValueOnce('started' as const)
      .mockResolvedValueOnce('fenced' as const);
    const recover = createBackgroundToolDeadClaimRecovery(
      retire,
      release,
      getGenerationJob,
      fenceGenerationClaim,
    );
    const input = {
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'response-1',
      claimId: 'batch-root-delivery',
    };

    await expect(recover(input)).resolves.toBe(false);
    expect(retire).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    await expect(recover(input)).resolves.toBe(true);
    expect(retire).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('retries claim release through an idempotently retired recovery receipt', async () => {
    const retire = jest.fn(async () => true);
    const release = jest
      .fn()
      .mockRejectedValueOnce(new Error('release receipt lost'))
      .mockResolvedValueOnce(true);
    const recover = createBackgroundToolDeadClaimRecovery(
      retire,
      release,
      async () => ({
        status: 'complete',
      }),
      async () => 'fenced',
    );
    const input = {
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'response-1',
      claimId: 'batch-root-delivery',
    };

    await expect(recover(input)).rejects.toThrow('release receipt lost');
    await expect(recover(input)).resolves.toBe(true);
    expect(retire).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("keeps unfinished sibling tasks out of each other's delivery lanes", async () => {
    const enqueue = jest.fn<
      ReturnType<EnqueueBackgroundToolCompletion>,
      Parameters<EnqueueBackgroundToolCompletion>
    >(async () => ({ deliveryKey: 'delivery-key' }));
    const notify = createBackgroundToolCompletionWakeupHandler(
      enqueue,
      async () => true,
      async () => true,
    );

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
    const notify = createBackgroundToolCompletionWakeupHandler(enqueue, retire, async () => true);

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

  it('shares one bounded input budget across a full sibling batch', async () => {
    const { methods } = resolverMethods();
    const results = Array.from({ length: 8 }, (_, index) => ({
      taskId: `task-${index}`,
      toolCallId: `call-${index}`,
      toolName: 'large_tool',
      status: 'completed' as const,
      output: `${index}:` + 'large result '.repeat(10_000),
    }));
    methods.claimBackgroundToolResults.mockResolvedValueOnce({ status: 'acquired', results });
    const resolve = createBackgroundToolCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    const prepared = await resolve(await envelope(), { idempotencyKey: 'delivery-large' });

    expect(prepared?.status).toBe('ready');
    if (prepared?.status === 'ready') {
      expect(prepared.input.length).toBeLessThanOrEqual(BACKGROUND_TOOL_WAKEUP_INPUT_MAX_CHARS);
      for (const result of results) {
        expect(prepared.input).toContain(result.taskId);
      }
      expect(prepared.input).toContain('[truncated:');
    }
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

  it('does not manufacture terminal evidence from wall-clock age', async () => {
    const { methods } = resolverMethods();
    methods.claimBackgroundToolResults.mockResolvedValue({ status: 'missing', results: [] });
    const deliveryEnvelope = await envelope({ createdAt: NOW - 7 * 24 * 60 * 60_000 });
    const resolve = createBackgroundToolCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    await expect(resolve(deliveryEnvelope, { idempotencyKey: 'delivery-1' })).rejects.toMatchObject(
      { code: 'BACKGROUND_TOOL_RESULT_NOT_READY', retryable: true },
    );
  });

  it('terminally rejects a missing result after its process-local producer is lost', async () => {
    const { methods } = resolverMethods();
    methods.claimBackgroundToolResults.mockResolvedValue({ status: 'missing', results: [] });
    methods.getAgentTriggerDeliveryProducerLease.mockResolvedValue({
      status: 'expired',
      leaseUntil: new Date(NOW - 1),
    });
    const resolve = createBackgroundToolCompletionWakeupResolver({
      methods: methods as never,
      getGenerationJob: async () => null,
    });

    await expect(resolve(await envelope(), { idempotencyKey: 'delivery-1' })).rejects.toMatchObject(
      {
        code: 'BACKGROUND_TOOL_PRODUCER_LOST',
        retryable: false,
      },
    );
  });
});
