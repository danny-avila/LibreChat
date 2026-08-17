import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type {
  AgentTriggerDeliveryFailure,
  IAgentTriggerDeliveryDocument,
  IAgentTriggerLaneSequenceDocument,
} from '~/types/triggerDelivery';
import {
  AgentTriggerDeliveryConflictError,
  createAgentTriggerDeliveryMethods,
  type AgentTriggerDeliveryMethods,
} from './triggerDelivery';
import { createAgentTriggerLaneSequenceModel } from '../models/triggerLaneSequence';
import { createAgentTriggerDeliveryModel } from '../models/triggerDelivery';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const DB_SETUP_TIMEOUT_MS = 60_000;
const START = new Date('2026-08-17T12:00:00.000Z');
let mongoServer: MongoMemoryServer;
let Delivery: Model<IAgentTriggerDeliveryDocument>;
let LaneSequence: Model<IAgentTriggerLaneSequenceDocument>;
let methods: AgentTriggerDeliveryMethods;
let counter = 0;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Delivery = createAgentTriggerDeliveryModel(mongoose);
  LaneSequence = createAgentTriggerLaneSequenceModel(mongoose);
  await Promise.all([Delivery.init(), LaneSequence.init()]);
  methods = createAgentTriggerDeliveryMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await Promise.all([Delivery.deleteMany({}), LaneSequence.deleteMany({})]);
});

function enqueueInput(
  overrides: Partial<Parameters<typeof methods.enqueueAgentTriggerDelivery>[0]> = {},
) {
  counter += 1;
  return {
    deliveryKey: `trigger_${counter}`,
    fingerprint: `fingerprint_${counter}`,
    orderingKey: 'ordering-1',
    envelope: { version: 1, delivery: counter },
    user: new mongoose.Types.ObjectId(),
    tenantId: 'tenant-1',
    availableAt: START,
    ...overrides,
  };
}

function transientFailure(overrides: Partial<AgentTriggerDeliveryFailure> = {}) {
  return {
    code: 'RATE_LIMITED',
    message: 'try later',
    certainty: 'definite' as const,
    retryable: true,
    attemptedAt: START,
    status: 429,
    ...overrides,
  };
}

describe('agent trigger delivery methods', () => {
  it('enqueues idempotently and rejects key reuse with different content', async () => {
    const input = enqueueInput();
    const first = await methods.enqueueAgentTriggerDelivery(input);
    const replay = await methods.enqueueAgentTriggerDelivery(input);

    expect(first.replayed).toBe(false);
    expect(first.delivery).toMatchObject({ status: 'pending', attempts: 0 });
    expect(replay).toMatchObject({ replayed: true, delivery: { id: first.delivery.id } });
    await expect(
      methods.enqueueAgentTriggerDelivery({ ...input, fingerprint: 'different' }),
    ).rejects.toBeInstanceOf(AgentTriggerDeliveryConflictError);
    expect(await Delivery.countDocuments()).toBe(1);
  });

  it('grants one atomic winner across concurrent claims', async () => {
    await methods.enqueueAgentTriggerDelivery(enqueueInput());
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        methods.claimNextAgentTriggerDelivery({
          workerId: `worker-${index}`,
          claimToken: `claim-${index}`,
          now: START,
          leaseUntil: new Date(START.getTime() + 60_000),
        }),
      ),
    );

    expect(claims.filter((claim) => claim != null)).toHaveLength(1);
  });

  it('allocates a replica-stable monotonic sequence within an ordering lane', async () => {
    const user = new mongoose.Types.ObjectId();
    const replicas = [
      createAgentTriggerDeliveryMethods(mongoose),
      createAgentTriggerDeliveryMethods(mongoose),
    ];
    const enqueued = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        replicas[index % replicas.length].enqueueAgentTriggerDelivery(
          enqueueInput({ user, orderingKey: 'shared-lane' }),
        ),
      ),
    );

    expect(enqueued.map(({ delivery }) => delivery.laneSequence).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
  });

  it('orders a lane by its atomic sequence instead of tied timestamps or process ObjectIds', async () => {
    const user = new mongoose.Types.ObjectId();
    const common = {
      orderingKey: 'tied-lane',
      envelope: { version: 1 },
      user,
      status: 'pending' as const,
      attempts: 0,
      availableAt: START,
      createdAt: START,
      updatedAt: START,
    };
    await Delivery.create([
      {
        ...common,
        _id: new mongoose.Types.ObjectId('ffffffffffffffffffffffff'),
        deliveryKey: 'first-by-sequence',
        fingerprint: 'first',
        laneSequence: 1,
      },
      {
        ...common,
        _id: new mongoose.Types.ObjectId('000000000000000000000001'),
        deliveryKey: 'second-by-sequence',
        fingerprint: 'second',
        laneSequence: 2,
      },
    ]);

    await expect(
      methods.findEarlierAgentTriggerDelivery({
        orderingKey: 'tied-lane',
        laneSequence: 2,
      }),
    ).resolves.toEqual({ availableAt: START });
  });

  it('honors the lease skew margin before takeover', async () => {
    await methods.enqueueAgentTriggerDelivery(enqueueInput());
    const first = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    expect(first).not.toBeNull();

    await expect(
      methods.claimNextAgentTriggerDelivery({
        workerId: 'worker-2',
        claimToken: 'claim-2',
        now: new Date(START.getTime() + 70_000),
        leaseUntil: new Date(START.getTime() + 130_000),
      }),
    ).resolves.toBeNull();

    await expect(
      methods.claimNextAgentTriggerDelivery({
        workerId: 'worker-2',
        claimToken: 'claim-2',
        now: new Date(START.getTime() + 91_000),
        leaseUntil: new Date(START.getTime() + 151_000),
      }),
    ).resolves.toMatchObject({ claimToken: 'claim-2', leaseBy: 'worker-2' });
  });

  it('fences every settlement against a stale claimant', async () => {
    await methods.enqueueAgentTriggerDelivery(enqueueInput());
    const first = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 10_000),
    });
    expect(first).not.toBeNull();
    const second = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-2',
      now: new Date(START.getTime() + 41_000),
      leaseUntil: new Date(START.getTime() + 101_000),
    });
    expect(second).not.toBeNull();

    await expect(
      methods.completeAgentTriggerDelivery({
        id: first!.id,
        workerId: 'worker-1',
        claimToken: 'claim-1',
        attempt: 1,
        result: { conversationId: 'stale' },
        settledAt: START,
      }),
    ).resolves.toBe(false);
    await expect(
      methods.beginAgentTriggerDeliveryAttempt({
        id: second!.id,
        workerId: 'worker-1',
        claimToken: 'claim-2',
        now: new Date(START.getTime() + 41_000),
      }),
    ).resolves.toBe(1);
  });

  it('blocks a due delivery behind an earlier pending item in its ordering lane', async () => {
    const first = await methods.enqueueAgentTriggerDelivery(
      enqueueInput({ availableAt: new Date(START.getTime() + 60_000) }),
    );
    await methods.enqueueAgentTriggerDelivery(enqueueInput());
    const claimed = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    expect(claimed?.id).not.toBe(first.delivery.id);

    await expect(methods.findEarlierAgentTriggerDelivery(claimed!)).resolves.toEqual({
      availableAt: new Date(START.getTime() + 60_000),
    });
  });

  it('records retry and success outcomes and expires only successful rows', async () => {
    const queued = await methods.enqueueAgentTriggerDelivery(enqueueInput());
    const first = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    const attempt = await methods.beginAgentTriggerDeliveryAttempt({
      id: first!.id,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
    });
    await methods.retryAgentTriggerDelivery({
      id: first!.id,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: attempt!,
      error: transientFailure(),
      availableAt: new Date(START.getTime() + 1_000),
    });

    const second = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-2',
      claimToken: 'claim-2',
      now: new Date(START.getTime() + 1_000),
      leaseUntil: new Date(START.getTime() + 61_000),
    });
    const secondAttempt = await methods.beginAgentTriggerDeliveryAttempt({
      id: second!.id,
      workerId: 'worker-2',
      claimToken: 'claim-2',
      now: new Date(START.getTime() + 1_000),
    });
    await methods.completeAgentTriggerDelivery({
      id: second!.id,
      workerId: 'worker-2',
      claimToken: 'claim-2',
      attempt: secondAttempt!,
      result: { conversationId: 'conversation-1' },
      settledAt: new Date(START.getTime() + 2_000),
    });

    const stored = await methods.getAgentTriggerDelivery(queued.delivery.deliveryKey);
    expect(stored).toMatchObject({
      status: 'succeeded',
      attempts: 2,
      result: { conversationId: 'conversation-1' },
      history: [
        { attempt: 1, outcome: 'retry', workerId: 'worker-1' },
        { attempt: 2, outcome: 'succeeded', workerId: 'worker-2' },
      ],
    });
    expect(stored?.expiresAt?.getTime()).toBe(
      new Date(START.getTime() + 2_000).getTime() + 90 * 24 * 60 * 60_000,
    );
  });

  it('retains dead letters, truncates failure text, and supports explicit requeue', async () => {
    const queued = await methods.enqueueAgentTriggerDelivery(enqueueInput());
    const claim = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    const attempt = await methods.beginAgentTriggerDeliveryAttempt({
      id: claim!.id,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
    });
    await methods.deadLetterAgentTriggerDelivery({
      id: claim!.id,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: attempt!,
      error: transientFailure({
        code: 'X'.repeat(256),
        message: 'x'.repeat(3_000),
        retryable: false,
      }),
      settledAt: START,
    });

    const [dead] = await methods.getAgentTriggerDeadLetters();
    expect(dead).toMatchObject({ id: queued.delivery.id, status: 'dead' });
    expect(dead.lastError?.code).toHaveLength(128);
    expect(dead.lastError?.message).toHaveLength(2048);
    expect(dead.expiresAt).toBeUndefined();

    const requeued = await methods.requeueAgentTriggerDelivery(dead.id, START);
    expect(requeued).toMatchObject({
      status: 'pending',
      attempts: 0,
      requeueCount: 1,
    });
    expect(requeued?.lastError).toBeUndefined();
    expect(await methods.getAgentTriggerDeadLetters()).toEqual([]);
    await expect(methods.getAgentTriggerDeadLetters(Number.NaN)).rejects.toThrow(
      'Agent trigger dead-letter limit must be a positive integer',
    );
  });

  it('counts only live leases while an account deletion drains', async () => {
    const user = new mongoose.Types.ObjectId();
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });

    expect(await methods.countActiveAgentTriggerDeliveriesByUser(user, START)).toBe(1);
    expect(
      await methods.countActiveAgentTriggerDeliveriesByUser(
        user,
        new Date(START.getTime() + 60_001),
      ),
    ).toBe(0);
  });

  it('deletes all queued payloads for an erased user', async () => {
    const user = new mongoose.Types.ObjectId();
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ orderingKey: 'ordering-other' }));

    await methods.deleteAgentTriggerDeliveriesByUser(user);

    expect(await Delivery.countDocuments({ user })).toBe(0);
    expect(await Delivery.countDocuments()).toBe(1);
    expect(await LaneSequence.countDocuments({ user })).toBe(0);
    expect(await LaneSequence.countDocuments()).toBe(1);
  });
});
