import { Types } from 'mongoose';
import type {
  AgentQueuedTurnClaim,
  AgentQueuedTurnMethods,
  AgentQueuedTurnRecord,
  ConversationMethods,
  MessageMethods,
} from '@librechat/data-schemas';
import type { AgentContinueTriggerEnvelope } from './triggers/envelope';
import {
  AGENT_QUEUED_TURN_SOURCE,
  createAgentQueuedTurnResolver,
  createAgentQueuedTurnScheduler,
} from './queuedTurns';
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

function resolverMethods() {
  const turn = claim();
  const methods = {
    getConvo: jest.fn(async () => ({ tenantId: 'tenant-1', agent_id: 'agent-1' })),
    getMessages: jest.fn(async () => [
      {
        messageId: 'assistant-1',
        parentMessageId: 'user-1',
        isCreatedByUser: false,
        createdAt: new Date(NOW - 500),
      },
      {
        messageId: 'assistant-2',
        parentMessageId: 'assistant-1',
        isCreatedByUser: false,
        createdAt: new Date(NOW),
      },
    ]),
    claimNextAgentQueuedTurn: jest.fn(async () => ({ outcome: 'acquired' as const, claim: turn })),
    releaseAgentQueuedTurn: jest.fn(async () => ({ outcome: 'released' as const, turn })),
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
      }),
    );
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
    const enqueue = jest.fn(async () => ({ deliveryKey: 'delivery-key' }));
    const markQueuedTurnScheduled = jest.fn(async (input) => ({
      outcome: 'scheduled' as const,
      turn: queuedTurn(input.queuedTurnId, 1),
    }));
    const scheduler = createAgentQueuedTurnScheduler({
      methods: { markQueuedTurnScheduled } as unknown as AgentQueuedTurnMethods,
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
  });
});
