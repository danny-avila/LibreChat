import { Types } from 'mongoose';
import type {
  AgentQueuedTurnClaim,
  AgentQueuedTurnMethods,
  AgentQueuedTurnRecord,
  ConversationMethods,
  IMessage,
  MessageMethods,
} from '@librechat/data-schemas';
import type { AgentContinueTriggerEnvelope } from './triggers/envelope';
import {
  AGENT_QUEUED_TURN_SOURCE,
  createAgentQueuedTurnDeadLetterSettlement,
  createAgentQueuedTurnResolver,
  createAgentQueuedTurnScheduler,
} from './queuedTurns';
import { getAgentTriggerIdempotencyKey } from './triggers/envelope';
import { AgentTriggerExecutionError } from './triggers/host';

const NOW = Date.parse('2026-08-30T12:00:00Z');
const USER_ID = '507f191e810c19729de860ea';

function envelope(): AgentContinueTriggerEnvelope {
  return {
    version: 1,
    mode: 'continue',
    requestId: 'request-1',
    deliveryId: 'queued-turn-1',
    receivedAt: NOW,
    principal: { userId: USER_ID, tenantId: 'tenant-1' },
    event: {
      id: 'queued-turn-1',
      type: 'agent.queued-turn',
      occurredAt: NOW,
      source: { id: AGENT_QUEUED_TURN_SOURCE, type: 'internal' },
      payload: { queuedTurnId: 'queued-turn-1' },
    },
    target: {
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      parentMessageId: 'assistant-1',
    },
    input: 'queued words',
  };
}

function claim(): AgentQueuedTurnClaim {
  return {
    queuedTurnId: 'queued-turn-1',
    user: new Types.ObjectId(USER_ID),
    tenantId: 'tenant-1',
    conversationId: 'conversation-1',
    agentId: 'agent-1',
    parentMessageId: 'assistant-1',
    clientRequestId: 'client-1',
    fingerprint: 'fingerprint-1',
    sequence: 1,
    status: 'claimed',
    priority: false,
    text: 'queued words',
    files: [{ file_id: 'file-1' }],
    quotes: ['quote'],
    manualSkills: ['skill-1'],
    attempts: 1,
    availableAt: new Date(NOW),
    claimId: 'trigger-1',
    claimBy: 'worker-1',
    claimUntil: new Date(NOW + 60_000),
    createdAt: new Date(NOW - 1_000),
  };
}

function persistedMessage(
  value: Pick<IMessage, 'messageId' | 'parentMessageId' | 'isCreatedByUser'> &
    Partial<Pick<IMessage, 'createdAt' | 'unfinished' | 'error'>>,
): IMessage {
  return value as unknown as IMessage;
}

function resolverMethods() {
  const turn = claim();
  const methods = {
    getConvo: jest.fn(async () => ({ tenantId: 'tenant-1', agent_id: 'agent-1' })),
    getMessages: jest.fn(
      async (..._args: Parameters<MessageMethods['getMessages']>): Promise<IMessage[]> => [
        persistedMessage({
          messageId: 'assistant-1',
          parentMessageId: 'user-1',
          isCreatedByUser: false,
          createdAt: new Date(NOW - 500),
        }),
        persistedMessage({
          messageId: 'assistant-2',
          parentMessageId: 'assistant-1',
          isCreatedByUser: false,
          createdAt: new Date(NOW),
        }),
      ],
    ),
    claimNextAgentQueuedTurn: jest.fn(
      async (..._args: Parameters<AgentQueuedTurnMethods['claimNextAgentQueuedTurn']>) => ({
        outcome: 'acquired' as const,
        claim: turn,
      }),
    ),
    releaseAgentQueuedTurn: jest.fn(async () => ({ outcome: 'released' as const, turn })),
    beginAgentQueuedTurnAdmission: jest.fn(async () => ({
      outcome: 'started' as const,
      turn,
    })),
    getEffectiveAgentQueuedTurnPredecessor: jest.fn(
      async (
        ..._args: Parameters<AgentQueuedTurnMethods['getEffectiveAgentQueuedTurnPredecessor']>
      ): Promise<number | undefined> => undefined,
    ),
    markAgentQueuedTurnAdmitted: jest.fn(async () => ({
      outcome: 'admitted' as const,
      turn: { ...turn, status: 'admitted' as const },
    })),
  };
  return {
    methods: methods as unknown as AgentQueuedTurnMethods &
      Pick<ConversationMethods, 'getConvo'> &
      Pick<MessageMethods, 'getMessages'>,
    spies: methods,
  };
}

describe('Agent queued-turn continuation', () => {
  it('dead-letters a delivery while preserving an admission-indeterminate source', async () => {
    const deadLetterAgentQueuedTurn = jest.fn(async () => ({
      outcome: 'admission_indeterminate' as const,
      turn: claim(),
    }));
    const settle = createAgentQueuedTurnDeadLetterSettlement({
      methods: { deadLetterAgentQueuedTurn },
      now: () => NOW,
    });

    await expect(
      settle(envelope(), {
        code: 'ATTEMPTS_EXHAUSTED',
        message: 'admission receipt unavailable',
        certainty: 'ambiguous',
        retryable: true,
        attemptedAt: new Date(NOW),
      }),
    ).resolves.toBeUndefined();
    expect(deadLetterAgentQueuedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedTurnId: 'queued-turn-1',
        deliveryKey: getAgentTriggerIdempotencyKey(envelope()),
      }),
    );
  });

  it('defers without claiming while the predecessor generation remains active', async () => {
    const { methods, spies } = resolverMethods();
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => ({ status: 'running' }),
      now: () => NOW,
      claimBy: 'worker-1',
    });

    await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).rejects.toMatchObject({
      code: 'PARENT_NOT_READY',
      retryable: true,
      deferWithoutAttempt: true,
    });
    expect(spies.claimNextAgentQueuedTurn).not.toHaveBeenCalled();
  });

  it('preserves queued context and settles only after fresh-turn admission', async () => {
    const { methods, spies } = resolverMethods();
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });

    const prepared = await resolve(envelope(), { idempotencyKey: 'trigger-1' });
    expect(prepared).toMatchObject({
      status: 'ready',
      input: 'queued words',
      parentMessageId: 'assistant-2',
      files: [{ file_id: 'file-1' }],
      quotes: ['quote'],
      manualSkills: ['skill-1'],
    });
    if (prepared?.status !== 'ready') {
      throw new Error('Expected a ready queued turn');
    }
    expect(spies.markAgentQueuedTurnAdmitted).not.toHaveBeenCalled();
    expect(spies.beginAgentQueuedTurnAdmission).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedTurnId: 'queued-turn-1',
        admissionId: 'trigger-1',
      }),
    );
    await prepared.settleOnAdmission?.({
      mode: 'continue',
      status: 'started',
      conversationId: 'conversation-1',
      streamId: 'stream-1',
      generationCreatedAt: NOW + 1,
    });
    expect(spies.markAgentQueuedTurnAdmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedTurnId: 'queued-turn-1',
        admissionId: 'trigger-1',
        admissionMode: 'ordinary',
        generationId: 'stream-1',
        generationCreatedAt: NOW + 1,
      }),
    );
  });

  it('uses the latest admitted queued generation as the effective predecessor epoch', async () => {
    const { methods, spies } = resolverMethods();
    const claimed = claim();
    claimed.expectedPredecessorCreatedAt = NOW;
    spies.claimNextAgentQueuedTurn.mockResolvedValueOnce({ outcome: 'acquired', claim: claimed });
    spies.getEffectiveAgentQueuedTurnPredecessor.mockResolvedValueOnce(NOW + 250);
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });

    await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).resolves.toMatchObject({
      status: 'ready',
      expectedPredecessorCreatedAt: NOW + 250,
    });
    expect(spies.getEffectiveAgentQueuedTurnPredecessor).toHaveBeenCalledWith({
      user: new Types.ObjectId(USER_ID),
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      sequence: 1,
      expectedPredecessorCreatedAt: NOW,
    });
  });

  it.each([
    ['aborted', 'PREDECESSOR_ABORTED'],
    ['error', 'PREDECESSOR_FAILED'],
  ] as const)('dead-letters a queued turn whose predecessor is %s', async (status, code) => {
    const { methods, spies } = resolverMethods();
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => ({ status }),
      now: () => NOW,
      claimBy: 'worker-1',
    });

    await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).resolves.toEqual({
      status: 'settled',
    });
    expect(spies.releaseAgentQueuedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'dead',
        failure: expect.objectContaining({ code }),
      }),
    );
    expect(spies.getMessages).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ unfinished: true }, 'PREDECESSOR_ABORTED'],
    [{ error: true }, 'PREDECESSOR_FAILED'],
  ] as const)(
    'uses durable response history after the transient predecessor job is cleaned up',
    async (terminal, code) => {
      const { methods, spies } = resolverMethods();
      spies.getMessages.mockResolvedValueOnce([
        persistedMessage({
          messageId: 'assistant-1',
          parentMessageId: 'user-1',
          isCreatedByUser: false,
          createdAt: new Date(NOW),
          ...terminal,
        }),
      ]);
      const resolve = createAgentQueuedTurnResolver({
        methods,
        getGenerationJob: async () => null,
        now: () => NOW,
        claimBy: 'worker-1',
      });

      await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).resolves.toEqual({
        status: 'settled',
      });
      expect(spies.releaseAgentQueuedTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          disposition: 'dead',
          failure: expect.objectContaining({ code }),
        }),
      );
    },
  );

  it('allows an explicitly prioritized interrupt successor after its predecessor is unfinished', async () => {
    const { methods, spies } = resolverMethods();
    const prioritized = claim();
    prioritized.priority = true;
    spies.claimNextAgentQueuedTurn.mockResolvedValueOnce({
      outcome: 'acquired',
      claim: prioritized,
    });
    spies.getMessages.mockResolvedValueOnce([
      persistedMessage({
        messageId: 'assistant-1',
        parentMessageId: 'user-1',
        isCreatedByUser: false,
        createdAt: new Date(NOW),
        unfinished: true,
      }),
    ]);
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });

    await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).resolves.toMatchObject({
      status: 'ready',
      parentMessageId: 'assistant-1',
    });
  });

  it('dead-letters the queue row when admission is definitely rejected', async () => {
    const { methods, spies } = resolverMethods();
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });
    const prepared = await resolve(envelope(), { idempotencyKey: 'trigger-1' });
    if (prepared?.status !== 'ready') {
      throw new Error('Expected a ready queued turn');
    }
    await prepared.releaseOnDefiniteFailure?.(
      new AgentTriggerExecutionError('forbidden', {
        mode: 'continue',
        certainty: 'definite',
        retryable: false,
        status: 403,
        code: 'FORBIDDEN',
      }),
    );
    expect(spies.releaseAgentQueuedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'dead',
        failure: { code: 'FORBIDDEN', message: 'forbidden' },
      }),
    );
  });

  it('releases a claim when admission defers with PARENT_NOT_READY', async () => {
    const { methods, spies } = resolverMethods();
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });
    const prepared = await resolve(envelope(), { idempotencyKey: 'trigger-1' });
    if (prepared?.status !== 'ready') {
      throw new Error('Expected a ready queued turn');
    }
    await prepared.releaseOnDefiniteFailure?.(
      new AgentTriggerExecutionError('parent raced', {
        mode: 'continue',
        certainty: 'definite',
        retryable: true,
        deferWithoutAttempt: true,
        status: 409,
        code: 'PARENT_NOT_READY',
      }),
    );
    expect(spies.releaseAgentQueuedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedTurnId: 'queued-turn-1',
        claimId: 'trigger-1',
        claimBy: 'worker-1',
        disposition: 'retry',
      }),
    );
  });

  it('dead-letters a retryable admission rejection on the final delivery attempt', async () => {
    const { methods, spies } = resolverMethods();
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });
    const prepared = await resolve(envelope(), {
      idempotencyKey: 'trigger-1',
      attempt: 3,
      maxAttempts: 3,
    });
    if (prepared?.status !== 'ready') {
      throw new Error('Expected a ready queued turn');
    }

    await prepared.releaseOnDefiniteFailure?.(
      new AgentTriggerExecutionError('still busy', {
        mode: 'continue',
        certainty: 'definite',
        retryable: true,
        status: 503,
        code: 'ADMISSION_BUSY',
      }),
    );
    expect(spies.releaseAgentQueuedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'dead',
        failure: { code: 'ADMISSION_BUSY', message: 'still busy' },
      }),
    );
  });

  it('releases an acquired claim when branch preparation is temporarily unavailable', async () => {
    const { methods, spies } = resolverMethods();
    spies.getMessages.mockRejectedValueOnce(new Error('read unavailable'));
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });

    await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).rejects.toMatchObject({
      code: 'QUEUED_TURN_PREPARATION_UNAVAILABLE',
      retryable: true,
      deferWithoutAttempt: true,
    });
    expect(spies.releaseAgentQueuedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        queuedTurnId: 'queued-turn-1',
        claimId: 'trigger-1',
        claimBy: 'worker-1',
        disposition: 'retry',
      }),
    );
  });

  it('keeps a failed preparation release retryable under the same claim fence', async () => {
    const { methods, spies } = resolverMethods();
    spies.getMessages.mockRejectedValueOnce(new Error('read unavailable'));
    spies.releaseAgentQueuedTurn.mockRejectedValueOnce(new Error('write unavailable'));
    const resolve = createAgentQueuedTurnResolver({
      methods,
      getGenerationJob: async () => null,
      now: () => NOW,
      claimBy: 'worker-1',
    });

    await expect(resolve(envelope(), { idempotencyKey: 'trigger-1' })).rejects.toMatchObject({
      code: 'QUEUED_TURN_PREPARATION_RELEASE_FAILED',
      retryable: true,
      deferWithoutAttempt: true,
    });
  });

  it('uses a replica-unique default claim owner that remains stable for the process', async () => {
    const first = resolverMethods();
    const second = resolverMethods();
    const firstResolve = createAgentQueuedTurnResolver({
      methods: first.methods,
      getGenerationJob: async () => null,
      now: () => NOW,
    });
    const secondResolve = createAgentQueuedTurnResolver({
      methods: second.methods,
      getGenerationJob: async () => null,
      now: () => NOW,
    });

    await firstResolve(envelope(), { idempotencyKey: 'trigger-1' });
    await secondResolve(envelope(), { idempotencyKey: 'trigger-1' });
    const firstOwner = first.spies.claimNextAgentQueuedTurn.mock.calls[0][0].claimBy;
    const secondOwner = second.spies.claimNextAgentQueuedTurn.mock.calls[0][0].claimBy;
    expect(firstOwner).toMatch(/^agent-queued-turn:\d+:[0-9a-f-]{36}$/);
    expect(secondOwner).toBe(firstOwner);
  });
});

describe('Agent queued-turn delivery scheduling', () => {
  function queuedTurn(id: string, sequence: number): AgentQueuedTurnRecord {
    const { claimId: _claimId, claimBy: _claimBy, claimUntil: _claimUntil, ...record } = claim();
    return {
      ...record,
      queuedTurnId: id,
      sequence,
      status: 'queued',
    };
  }

  it('uses independent delivery lanes so publication order cannot invert queue order', async () => {
    const enqueue = jest.fn(async (value: unknown) => ({
      deliveryKey: getAgentTriggerIdempotencyKey(value as AgentContinueTriggerEnvelope),
    }));
    const reserveAgentQueuedTurnDelivery = jest.fn(async (input) => ({
      outcome: 'reserved' as const,
      turn: { ...queuedTurn(input.queuedTurnId, 1), deliveryKey: input.deliveryKey },
    }));
    const markQueuedTurnScheduled = jest.fn(async (input) => ({
      outcome: 'scheduled' as const,
      turn: queuedTurn(input.queuedTurnId, 1),
    }));
    const scheduler = createAgentQueuedTurnScheduler({
      methods: {
        reserveAgentQueuedTurnDelivery,
        markQueuedTurnScheduled,
      } as unknown as AgentQueuedTurnMethods,
      enqueue,
    });

    await scheduler.schedule(queuedTurn('queued-turn-2', 2));
    await scheduler.schedule(queuedTurn('queued-turn-1', 1));

    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ orderingKey: 'agent-queued-turn-delivery:queued-turn-2' }),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ orderingKey: 'agent-queued-turn-delivery:queued-turn-1' }),
    );
    expect(reserveAgentQueuedTurnDelivery).toHaveBeenCalledTimes(2);
    expect(reserveAgentQueuedTurnDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      enqueue.mock.invocationCallOrder[0],
    );
    expect(reserveAgentQueuedTurnDelivery.mock.calls[0]?.[0].deliveryKey).toBe(
      getAgentTriggerIdempotencyKey(enqueue.mock.calls[0]?.[0] as AgentContinueTriggerEnvelope),
    );
  });
});
