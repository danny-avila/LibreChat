import { getTenantId, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import type { AgentTriggerDeliveryPersistence, AgentTriggerStoredRecord } from './service';
import { AgentTriggerServiceUnavailableError, createAgentTriggerService } from './service';
import { __resetShutdownStateForTests } from '../../app/shutdown';
import { createAgentTriggerEnvelope } from './envelope';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  };
});

const START = new Date('2026-08-17T12:00:00.000Z');

const envelope = () =>
  createAgentTriggerEnvelope({
    mode: 'fire',
    requestId: 'request-1',
    deliveryId: 'delivery-1',
    receivedAt: 20,
    principal: { id: '507f1f77bcf86cd799439011', tenantId: 'tenant-1' },
    target: { agentId: 'agent-1' },
    event: {
      id: 'event-1',
      type: 'resource.ready',
      occurredAt: 10,
      source: { id: 'source-1', type: 'webhook' },
    },
    input: 'Handle the ready resource.',
  });

function deliveryRecord(overrides: Partial<AgentTriggerStoredRecord> = {}) {
  return {
    id: 'delivery-row-1',
    user: '507f1f77bcf86cd799439011',
    deliveryKey: 'trigger_1',
    fingerprint: 'fingerprint-1',
    orderingKey: 'ordering-1',
    laneSequence: 1,
    envelope: envelope(),
    tenantId: 'tenant-1',
    status: 'pending' as const,
    attempts: 0,
    availableAt: START,
    createdAt: START,
    ...overrides,
  };
}

function deliveryMethods(
  overrides: Partial<AgentTriggerDeliveryPersistence> = {},
): AgentTriggerDeliveryPersistence {
  return {
    ensureAgentTriggerDeliveryIndexes: jest.fn(async () => undefined),
    enqueueAgentTriggerDelivery: jest.fn(async (input) => ({
      delivery: deliveryRecord({
        deliveryKey: input.deliveryKey,
        fingerprint: input.fingerprint,
        orderingKey: input.orderingKey,
        laneSequence: 1,
        envelope: input.envelope,
        availableAt: input.availableAt,
      }),
      replayed: false,
    })),
    claimNextAgentTriggerDelivery: jest.fn(async () => null),
    findEarlierAgentTriggerDelivery: jest.fn(async () => null),
    releaseAgentTriggerDelivery: jest.fn(async () => true),
    beginAgentTriggerDeliveryAttempt: jest.fn(async () => 1),
    deferAgentTriggerDeliveryAttempt: jest.fn(async () => true),
    completeAgentTriggerDelivery: jest.fn(async () => true),
    retryAgentTriggerDelivery: jest.fn(async () => true),
    deadLetterAgentTriggerDelivery: jest.fn(async () => true),
    getAgentTriggerDelivery: jest.fn(async () => null),
    getAgentTriggerDeadLetters: jest.fn(async () => []),
    requeueAgentTriggerDelivery: jest.fn(async () => null),
    countActiveAgentTriggerDeliveriesByUser: jest.fn(async () => 0),
    recoverAgentTriggerLanePublications: jest.fn(async () => 0),
    reclaimInactiveAgentTriggerLanes: jest.fn(async () => 0),
    prepareAgentTriggerUserPurge: jest.fn(async () => undefined),
    cancelAgentTriggerUserPurge: jest.fn(async () => true),
    recoverAgentTriggerUserPurges: jest.fn(async () => 0),
    deleteAgentTriggerDeliveriesByUser: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('durable agent trigger service', () => {
  const originalSelfUrl = process.env.AGENT_TRIGGERS_SELF_URL;

  beforeEach(() => {
    __resetShutdownStateForTests();
    delete process.env.AGENT_TRIGGERS_SELF_URL;
  });

  afterEach(() => {
    __resetShutdownStateForTests();
  });

  afterAll(() => {
    if (originalSelfUrl == null) {
      delete process.env.AGENT_TRIGGERS_SELF_URL;
    } else {
      process.env.AGENT_TRIGGERS_SELF_URL = originalSelfUrl;
    }
  });

  it('fails closed before indexes and the delivery engine are ready', async () => {
    const service = createAgentTriggerService({ methods: deliveryMethods() });

    await expect(service.enqueue(envelope())).rejects.toBeInstanceOf(
      AgentTriggerServiceUnavailableError,
    );
    await service.stop();
  });

  it('refuses to arm without a reachable self origin', async () => {
    const service = createAgentTriggerService({ methods: deliveryMethods() });

    await expect(service.initialize()).rejects.toThrow(
      'requires a valid listener address or AGENT_TRIGGERS_SELF_URL',
    );
    await service.stop();
  });

  it('initializes indexes, enqueues normalized source-neutral work, and starts claims', async () => {
    const methods = deliveryMethods();
    const service = createAgentTriggerService({
      methods,
      mintToken: () => 'token',
      fetch: async () => new Response('{}', { status: 500 }),
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });

    await service.initialize({ address: { address: '127.0.0.1', family: 'IPv4', port: 3080 } });
    const receipt = await service.enqueue(envelope(), {
      orderingKey: 'match-42',
      availableAt: START,
    });

    expect(methods.ensureAgentTriggerDeliveryIndexes).toHaveBeenCalledTimes(1);
    expect(methods.claimNextAgentTriggerDelivery).toHaveBeenCalled();
    expect(methods.enqueueAgentTriggerDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: expect.stringMatching(/^trigger_/),
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        orderingKey: expect.stringMatching(/^trigger_lane_/),
        user: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-1',
        availableAt: START,
      }),
    );
    expect(receipt).toMatchObject({
      id: 'delivery-row-1',
      status: 'pending',
      replayed: false,
      availableAt: START,
    });
    await service.stop();
  });

  it('rejects enqueue before persistence when the principal was deleted', async () => {
    const methods = deliveryMethods();
    const service = createAgentTriggerService({
      methods,
      isPrincipalActive: async () => false,
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });

    await expect(service.enqueue(envelope())).rejects.toThrow(
      'Agent trigger delivery principal is no longer active',
    );
    expect(methods.enqueueAgentTriggerDelivery).not.toHaveBeenCalled();
    await service.stop();
  });

  it('preserves a just-enqueued row when deletion wins the admission race', async () => {
    const methods = deliveryMethods();
    const isPrincipalActive = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const service = createAgentTriggerService({
      methods,
      isPrincipalActive,
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });

    await expect(service.enqueue(envelope())).rejects.toThrow(
      'Agent trigger delivery principal is no longer active',
    );
    expect(methods.countActiveAgentTriggerDeliveriesByUser).toHaveBeenCalled();
    expect(methods.deleteAgentTriggerDeliveriesByUser).not.toHaveBeenCalled();
    await service.stop();
  });

  it("drains without data loss, then purges one user's deliveries after commit", async () => {
    const countActiveAgentTriggerDeliveriesByUser = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const deleteAgentTriggerDeliveriesByUser = jest.fn(async () => {
      expect(getTenantId()).toBe(SYSTEM_TENANT_ID);
    });
    const methods = deliveryMethods({
      countActiveAgentTriggerDeliveriesByUser,
      deleteAgentTriggerDeliveriesByUser,
    });
    const service = createAgentTriggerService({
      methods,
      userDrainPollMs: 1,
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });

    await service.drainUser('507f1f77bcf86cd799439011');

    expect(countActiveAgentTriggerDeliveriesByUser).toHaveBeenCalledTimes(2);
    expect(deleteAgentTriggerDeliveriesByUser).not.toHaveBeenCalled();

    await service.stop();
    await service.purgeUser('507f1f77bcf86cd799439011');

    expect(deleteAgentTriggerDeliveriesByUser).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  it('arms and disarms post-commit purge recovery in system context', async () => {
    const prepareAgentTriggerUserPurge = jest.fn(async () => {
      expect(getTenantId()).toBe(SYSTEM_TENANT_ID);
    });
    const cancelAgentTriggerUserPurge = jest.fn(async () => {
      expect(getTenantId()).toBe(SYSTEM_TENANT_ID);
      return true;
    });
    const methods = deliveryMethods({
      prepareAgentTriggerUserPurge,
      cancelAgentTriggerUserPurge,
    });
    const service = createAgentTriggerService({
      methods,
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });
    const fence = new Date(START);

    await service.prepareUserPurge('507f1f77bcf86cd799439011', fence, 'tenant-1');
    await expect(service.cancelUserPurge('507f1f77bcf86cd799439011', fence)).resolves.toBe(true);

    expect(prepareAgentTriggerUserPurge).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      fence,
      'tenant-1',
    );
    await service.stop();
  });

  it('retries recoverable post-commit purges after a transient sweep failure', async () => {
    const recoverAgentTriggerUserPurges = jest
      .fn()
      .mockRejectedValueOnce(new Error('mongo unavailable'))
      .mockResolvedValue(1);
    const service = createAgentTriggerService({
      methods: deliveryMethods({ recoverAgentTriggerUserPurges }),
      purgeRecoveryIntervalMs: 5,
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(recoverAgentTriggerUserPurges.mock.calls.length).toBeGreaterThanOrEqual(2);
    await service.stop();
  });

  it('keeps trusted operational reads and requeue in system tenant context', async () => {
    const getAgentTriggerDeadLetters = jest.fn(async () => {
      expect(getTenantId()).toBe(SYSTEM_TENANT_ID);
      return [deliveryRecord({ status: 'dead' })];
    });
    const requeueAgentTriggerDelivery = jest.fn(async () => {
      expect(getTenantId()).toBe(SYSTEM_TENANT_ID);
      return deliveryRecord();
    });
    const methods = deliveryMethods({
      getAgentTriggerDeadLetters,
      requeueAgentTriggerDelivery,
    });
    const service = createAgentTriggerService({
      methods,
      deliveryOptions: { concurrency: 1, tickMs: 60_000 },
    });
    await service.initialize({
      address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
    });

    await expect(service.getDeadLetters(10)).resolves.toHaveLength(1);
    await expect(service.requeue('delivery-row-1', START)).resolves.toMatchObject({
      status: 'pending',
    });
    await service.stop();
  });

  it('does not become ready when the required unique indexes fail', async () => {
    const methods = deliveryMethods({
      ensureAgentTriggerDeliveryIndexes: jest.fn(async () =>
        Promise.reject(new Error('index unavailable')),
      ),
    });
    const service = createAgentTriggerService({ methods });

    await expect(
      service.initialize({
        address: { address: '127.0.0.1', family: 'IPv4', port: 3080 },
      }),
    ).rejects.toThrow('index unavailable');
    await expect(service.enqueue(envelope())).rejects.toBeInstanceOf(
      AgentTriggerServiceUnavailableError,
    );
    await service.stop();
  });
});
