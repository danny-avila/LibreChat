import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type {
  AgentTriggerDeliveryFailure,
  IAgentTriggerDeliveryDocument,
  IAgentTriggerLaneSequenceDocument,
  IAgentTriggerUserPurgeDocument,
} from '~/types/triggerDelivery';
import type { IUser } from '~/types/user';
import {
  AgentTriggerDeliveryConflictError,
  createAgentTriggerDeliveryMethods,
  type AgentTriggerDeliveryMethods,
} from './triggerDelivery';
import { createAgentTriggerLaneSequenceModel } from '../models/triggerLaneSequence';
import { createAgentTriggerUserPurgeModel } from '../models/triggerUserPurge';
import { createAgentTriggerDeliveryModel } from '../models/triggerDelivery';
import { createUserModel } from '../models/user';

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
let UserPurge: Model<IAgentTriggerUserPurgeDocument>;
let User: Model<IUser>;
let methods: AgentTriggerDeliveryMethods;
let counter = 0;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Delivery = createAgentTriggerDeliveryModel(mongoose);
  LaneSequence = createAgentTriggerLaneSequenceModel(mongoose);
  UserPurge = createAgentTriggerUserPurgeModel(mongoose);
  User = createUserModel(mongoose);
  await Promise.all([Delivery.init(), LaneSequence.init(), UserPurge.init(), User.init()]);
  methods = createAgentTriggerDeliveryMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

beforeEach(async () => {
  await Promise.all([
    Delivery.deleteMany({}),
    LaneSequence.deleteMany({}),
    UserPurge.deleteMany({}),
    User.deleteMany({}),
  ]);
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

  it('projects public status while enforcing API key, owner, and tenant in the query', async () => {
    const user = new mongoose.Types.ObjectId();
    const queued = await methods.enqueueAgentTriggerDelivery(
      enqueueInput({
        user,
        tenantId: 'tenant-1',
        envelope: {
          event: { source: { id: 'source-key-1', type: 'remote_api_key' } },
          privatePayload: 'x'.repeat(1024),
        },
      }),
    );

    const status = await methods.getAgentTriggerDeliveryStatus(
      queued.delivery.deliveryKey,
      user,
      'source-key-1',
      'tenant-1',
    );

    expect(status).toEqual({
      deliveryKey: queued.delivery.deliveryKey,
      status: 'pending',
      attempts: 0,
      availableAt: START,
      createdAt: expect.any(Date),
    });
    expect(status).not.toHaveProperty('envelope');
    expect(status).not.toHaveProperty('orderingKey');
    expect(status).not.toHaveProperty('history');
    await expect(
      methods.getAgentTriggerDeliveryStatus(
        queued.delivery.deliveryKey,
        new mongoose.Types.ObjectId(),
        'source-key-1',
        'tenant-1',
      ),
    ).resolves.toBeNull();

    const internal = await methods.enqueueAgentTriggerDelivery(
      enqueueInput({
        user,
        tenantId: 'tenant-1',
        envelope: { event: { source: { id: 'source-key-1', type: 'schedule' } } },
      }),
    );
    await expect(
      methods.getAgentTriggerDeliveryStatus(
        internal.delivery.deliveryKey,
        user,
        'source-key-1',
        'tenant-1',
      ),
    ).resolves.toBeNull();
    await expect(
      methods.getAgentTriggerDeliveryStatus(
        queued.delivery.deliveryKey,
        user,
        'source-key-1',
        'tenant-2',
      ),
    ).resolves.toBeNull();
    await expect(
      methods.getAgentTriggerDeliveryStatus(
        queued.delivery.deliveryKey,
        user,
        'source-key-2',
        'tenant-1',
      ),
    ).resolves.toBeNull();
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

  it('publishes an abandoned lane owner before allocating the next sequence', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'publication-race';
    const firstInput = enqueueInput({ user, orderingKey, availableAt: START });
    const first = await Delivery.create({
      ...firstInput,
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });
    await LaneSequence.create({
      _id: orderingKey,
      value: 1,
      user,
      tailDeliveryId: first._id,
      publisherDeliveryId: first._id,
      publisherStartedAt: START,
    });

    const second = await methods.enqueueAgentTriggerDelivery(
      enqueueInput({ user, orderingKey, availableAt: START }),
    );

    await expect(Delivery.findById(first._id).lean()).resolves.toMatchObject({
      status: 'pending',
      laneSequence: 1,
    });
    expect(second.delivery).toMatchObject({ status: 'pending', laneSequence: 2 });
    await expect(methods.findEarlierAgentTriggerDelivery(second.delivery)).resolves.toEqual({
      availableAt: START,
    });
    await expect(LaneSequence.findById(orderingKey).lean()).resolves.toMatchObject({ value: 2 });
    expect((await LaneSequence.findById(orderingKey).lean())?.publisherDeliveryId).toBeUndefined();
  });

  it('publishes an orphaned staging row before a later delivery in the lane', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'orphaned-staging';
    const firstInput = enqueueInput({ user, orderingKey, availableAt: START });
    const first = await Delivery.create({
      ...firstInput,
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });

    const second = await methods.enqueueAgentTriggerDelivery(
      enqueueInput({ user, orderingKey, availableAt: START }),
    );

    await expect(Delivery.findById(first._id).lean()).resolves.toMatchObject({
      status: 'pending',
      laneSequence: 1,
    });
    expect(second.delivery).toMatchObject({ status: 'pending', laneSequence: 2 });
    await expect(methods.findEarlierAgentTriggerDelivery(second.delivery)).resolves.toEqual({
      availableAt: START,
    });
  });

  it('discovers an orphaned staging row during maintenance recovery', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'maintenance-staging';
    const staged = await Delivery.create({
      ...enqueueInput({ user, orderingKey }),
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
      stagingRecoveryAt: START,
    });

    await expect(methods.recoverAgentTriggerLanePublications(1)).resolves.toBe(1);
    await expect(Delivery.findById(staged._id).lean()).resolves.toMatchObject({
      status: 'pending',
      laneSequence: 1,
    });
    await expect(LaneSequence.findById(orderingKey).lean()).resolves.toMatchObject({ value: 1 });
  });

  it('backfills and recovers a staging row created before the fairness cursor existed', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'legacy-maintenance-staging';
    const staged = await Delivery.create({
      ...enqueueInput({ user, orderingKey }),
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });

    await expect(methods.recoverAgentTriggerLanePublications(1)).resolves.toBe(1);
    await expect(Delivery.findById(staged._id).lean()).resolves.toMatchObject({
      status: 'pending',
      laneSequence: 1,
    });
  });

  it('leaves staging unpublished while its durable user purge marker exists', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'purge-fenced-staging';
    await UserPurge.create({ _id: user, fenceStartedAt: START, tenantId: 'tenant-1' });
    const staged = await Delivery.create({
      ...enqueueInput({ user, orderingKey }),
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
      stagingRecoveryAt: START,
    });

    await expect(methods.recoverAgentTriggerLanePublications(1)).resolves.toBe(0);
    await expect(Delivery.findById(staged._id).lean()).resolves.toMatchObject({
      status: 'staging',
      laneSequence: 0,
    });
    await expect(LaneSequence.findById(orderingKey)).resolves.toBeNull();
  });

  it('leaves an existing lane publisher fenced while its user purge marker exists', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'purge-fenced-publisher';
    await UserPurge.create({ _id: user, fenceStartedAt: START, tenantId: 'tenant-1' });
    const staged = await Delivery.create({
      ...enqueueInput({ user, orderingKey }),
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });
    await LaneSequence.create({
      _id: orderingKey,
      value: 1,
      user,
      tailDeliveryId: staged._id,
      publisherDeliveryId: staged._id,
      publisherStartedAt: START,
    });

    await expect(methods.recoverAgentTriggerLanePublications(1)).resolves.toBe(0);
    await expect(Delivery.findById(staged._id).lean()).resolves.toMatchObject({
      status: 'staging',
      laneSequence: 0,
    });
    await expect(LaneSequence.findById(orderingKey).lean()).resolves.toMatchObject({
      publisherDeliveryId: staged._id,
      value: 1,
    });
  });

  it('rotates purge-fenced staging rows so later recovery work is not starved', async () => {
    const users = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId());
    for (let index = 0; index < users.length; index += 1) {
      if (index < 2) {
        await UserPurge.create({ _id: users[index], fenceStartedAt: START });
      }
      await Delivery.create({
        ...enqueueInput({ user: users[index], orderingKey: `staging-rotation-${index}` }),
        laneSequence: 0,
        status: 'staging',
        attempts: 0,
        requeueCount: 0,
        stagingRecoveryAt: new Date(START.getTime() + index),
      });
    }

    await expect(methods.recoverAgentTriggerLanePublications(2)).resolves.toBe(0);
    await expect(methods.recoverAgentTriggerLanePublications(2)).resolves.toBe(1);
    await expect(
      Delivery.findOne({ orderingKey: 'staging-rotation-2' }).lean(),
    ).resolves.toMatchObject({ status: 'pending', laneSequence: 1 });
  });

  it('rotates purge-fenced publishers so later recovery work is not starved', async () => {
    const users = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId());
    for (let index = 0; index < users.length; index += 1) {
      if (index < 2) {
        await UserPurge.create({ _id: users[index], fenceStartedAt: START });
      }
      const orderingKey = `publisher-rotation-${index}`;
      const staged = await Delivery.create({
        ...enqueueInput({ user: users[index], orderingKey }),
        laneSequence: 0,
        status: 'staging',
        attempts: 0,
        requeueCount: 0,
        stagingRecoveryAt: START,
      });
      await LaneSequence.create({
        _id: orderingKey,
        value: 1,
        user: users[index],
        publisherDeliveryId: staged._id,
        publisherStartedAt: new Date(START.getTime() + index),
      });
    }

    await expect(methods.recoverAgentTriggerLanePublications(2)).resolves.toBe(0);
    await expect(methods.recoverAgentTriggerLanePublications(2)).resolves.toBe(1);
    await expect(
      Delivery.findOne({ orderingKey: 'publisher-rotation-2' }).lean(),
    ).resolves.toMatchObject({ status: 'pending', laneSequence: 1 });
  });

  it('abandons a lane acquired concurrently with a new purge marker', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'purge-race-staging';
    const staged = await Delivery.create({
      ...enqueueInput({ user, orderingKey }),
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });
    const purgeExists = jest
      .spyOn(UserPurge, 'exists')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: user } as never);

    try {
      await expect(methods.recoverAgentTriggerLanePublications(1)).resolves.toBe(0);
    } finally {
      purgeExists.mockRestore();
    }
    await expect(Delivery.findById(staged._id).lean()).resolves.toMatchObject({
      status: 'staging',
      laneSequence: 0,
    });
    await expect(LaneSequence.findById(orderingKey)).resolves.toBeNull();
  });

  it('builds a sparse index for the periodic publisher recovery scan', async () => {
    const [laneIndexes, deliveryIndexes] = await Promise.all([
      LaneSequence.collection.indexes(),
      Delivery.collection.indexes(),
    ]);

    expect(laneIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { publisherStartedAt: 1 }, sparse: true }),
      ]),
    );
    expect(deliveryIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { stagingRecoveryAt: 1 }, sparse: true }),
        expect.objectContaining({ key: { laneCleanupPendingAt: 1 }, sparse: true }),
      ]),
    );
  });

  it('publishes an idempotent replay on its persisted ordering lane', async () => {
    const user = new mongoose.Types.ObjectId();
    const input = enqueueInput({ user, orderingKey: 'original-lane' });
    await Delivery.create({
      ...input,
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });

    const replay = await methods.enqueueAgentTriggerDelivery({
      ...input,
      orderingKey: 'changed-lane',
    });

    expect(replay).toMatchObject({
      replayed: true,
      delivery: { orderingKey: 'original-lane', laneSequence: 1, status: 'pending' },
    });
    await expect(LaneSequence.findById('original-lane').lean()).resolves.toMatchObject({
      value: 1,
    });
    await expect(LaneSequence.findById('changed-lane').lean()).resolves.toBeNull();
  });

  it('resumes its own abandoned publication without allocating a second sequence', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'publication-replay';
    const input = enqueueInput({ user, orderingKey, availableAt: START });
    const staged = await Delivery.create({
      ...input,
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });
    await LaneSequence.create({
      _id: orderingKey,
      value: 1,
      user,
      tailDeliveryId: staged._id,
      publisherDeliveryId: staged._id,
      publisherStartedAt: START,
    });

    const replay = await methods.enqueueAgentTriggerDelivery(input);

    expect(replay).toMatchObject({ replayed: true, delivery: { laneSequence: 1 } });
    await expect(LaneSequence.findById(orderingKey).lean()).resolves.toMatchObject({ value: 1 });
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

  it('reclaims an inactive high-cardinality lane after its tail succeeds', async () => {
    const orderingKey = 'one-shot-resource-lane';
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ orderingKey }));
    const claimed = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    const attempt = await methods.beginAgentTriggerDeliveryAttempt({
      id: claimed!.id,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
    });

    await expect(
      methods.completeAgentTriggerDelivery({
        id: claimed!.id,
        workerId: 'worker-1',
        claimToken: 'claim-1',
        attempt: attempt!,
        result: { ok: true },
        settledAt: START,
      }),
    ).resolves.toBe(true);

    expect(await LaneSequence.countDocuments({ _id: orderingKey })).toBe(0);
  });

  it('rediscovers lane cleanup when success commits before its cleanup marker', async () => {
    const orderingKey = 'crashed-lane-cleanup';
    const queued = await methods.enqueueAgentTriggerDelivery(enqueueInput({ orderingKey }));
    const claimed = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    const attempt = await methods.beginAgentTriggerDeliveryAttempt({
      id: claimed!.id,
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
    });
    const laneUpdate = jest
      .spyOn(LaneSequence, 'updateOne')
      .mockRejectedValueOnce(new Error('down'));

    try {
      await expect(
        methods.completeAgentTriggerDelivery({
          id: claimed!.id,
          workerId: 'worker-1',
          claimToken: 'claim-1',
          attempt: attempt!,
          result: { ok: true },
          settledAt: START,
        }),
      ).resolves.toBe(true);
    } finally {
      laneUpdate.mockRestore();
    }
    await expect(Delivery.findById(queued.delivery.id).lean()).resolves.toMatchObject({
      status: 'succeeded',
      laneCleanupPendingAt: START,
    });

    await expect(methods.reclaimInactiveAgentTriggerLanes(1)).resolves.toBe(1);
    await expect(LaneSequence.findById(orderingKey)).resolves.toBeNull();
    expect(
      (await Delivery.findById(queued.delivery.id).lean())?.laneCleanupPendingAt,
    ).toBeUndefined();
  });

  it('restores the retry budget when dispatch is deferred before execution', async () => {
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

    await expect(
      methods.deferAgentTriggerDeliveryAttempt({
        id: claim!.id,
        workerId: 'worker-1',
        claimToken: 'claim-1',
        attempt: attempt!,
        availableAt: new Date(START.getTime() + 5_000),
      }),
    ).resolves.toBe(true);

    await expect(
      methods.getAgentTriggerDelivery(queued.delivery.deliveryKey),
    ).resolves.toMatchObject({
      status: 'pending',
      attempts: 0,
      availableAt: new Date(START.getTime() + 5_000),
    });
  });

  it('retains dead letters, truncates failure text, and supports explicit requeue', async () => {
    const user = new mongoose.Types.ObjectId();
    const orderingKey = 'dead-letter-requeue';
    const queued = await methods.enqueueAgentTriggerDelivery(enqueueInput({ user, orderingKey }));
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

    const later = await methods.enqueueAgentTriggerDelivery(enqueueInput({ user, orderingKey }));
    const laterClaim = await methods.claimNextAgentTriggerDelivery({
      workerId: 'worker-2',
      claimToken: 'claim-2',
      now: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
    expect(laterClaim?.id).toBe(later.delivery.id);

    const stagedAhead = await Delivery.create({
      ...enqueueInput({ user, orderingKey }),
      laneSequence: 0,
      status: 'staging',
      attempts: 0,
      requeueCount: 0,
    });
    await Delivery.collection.updateOne(
      { _id: stagedAhead._id },
      { $set: { updatedAt: new Date(0) } },
    );

    const requeued = await methods.requeueAgentTriggerDelivery(dead.id, START);
    expect(requeued).toMatchObject({
      status: 'pending',
      attempts: 0,
      requeueCount: 1,
      laneSequence: 4,
    });
    await expect(Delivery.findById(stagedAhead._id).lean()).resolves.toMatchObject({
      status: 'pending',
      laneSequence: 3,
    });
    expect(requeued?.lastError).toBeUndefined();
    await expect(methods.findEarlierAgentTriggerDelivery(requeued!)).resolves.toEqual({
      availableAt: START,
      leaseUntil: new Date(START.getTime() + 60_000),
    });
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
    const fenceStartedAt = new Date(START);
    await User.create({
      _id: user,
      email: 'immediate-purge@example.com',
      provider: 'local',
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ orderingKey: 'ordering-other' }));
    await methods.prepareAgentTriggerUserPurge(user, fenceStartedAt);
    await User.deleteOne({ _id: user });

    await methods.deleteAgentTriggerDeliveriesByUser(user);

    expect(await Delivery.countDocuments({ user })).toBe(0);
    expect(await Delivery.countDocuments()).toBe(1);
    expect(await LaneSequence.countDocuments({ user })).toBe(0);
    expect(await LaneSequence.countDocuments()).toBe(1);
    expect(await UserPurge.countDocuments({ _id: user })).toBe(0);
  });

  it('recovers an armed purge after the user deletion commits', async () => {
    const user = new mongoose.Types.ObjectId();
    const fenceStartedAt = new Date(START);
    await User.create({
      _id: user,
      email: 'purge@example.com',
      provider: 'local',
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.prepareAgentTriggerUserPurge(user, fenceStartedAt, 'tenant-1');

    await expect(methods.recoverAgentTriggerUserPurges()).resolves.toBe(0);
    expect(await Delivery.countDocuments({ user })).toBe(1);
    expect(await UserPurge.countDocuments({ _id: user })).toBe(1);

    await User.deleteOne({ _id: user });
    await expect(methods.recoverAgentTriggerUserPurges()).resolves.toBe(1);
    expect(await Delivery.countDocuments({ user })).toBe(0);
    expect(await LaneSequence.countDocuments({ user })).toBe(0);
    expect(await UserPurge.countDocuments({ _id: user })).toBe(0);
  });

  it('rotates active purge markers so a later committed purge is recovered', async () => {
    const users = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId());
    for (const [index, user] of users.entries()) {
      await User.create({
        _id: user,
        email: `purge-rotation-${index}@example.com`,
        provider: 'local',
        agentTriggerDeletionStartedAt: START,
      });
      await methods.prepareAgentTriggerUserPurge(user, START);
    }
    await Delivery.create({
      ...enqueueInput({ user: users[2], orderingKey: 'committed-purge-lane' }),
      laneSequence: 1,
      status: 'pending',
      attempts: 0,
      requeueCount: 0,
    });
    await User.deleteOne({ _id: users[2] });

    await expect(methods.recoverAgentTriggerUserPurges(2)).resolves.toBe(0);
    await expect(methods.recoverAgentTriggerUserPurges(2)).resolves.toBe(1);
    expect(await UserPurge.countDocuments({ _id: users[2] })).toBe(0);
    expect(await Delivery.countDocuments({ user: users[2] })).toBe(0);
    expect(await UserPurge.countDocuments({ _id: { $in: users.slice(0, 2) } })).toBe(2);
  });

  it('disarms a stale purge marker without touching an active user delivery', async () => {
    const user = new mongoose.Types.ObjectId();
    const fenceStartedAt = new Date(START);
    await User.create({
      _id: user,
      email: 'rollback@example.com',
      provider: 'local',
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    await methods.enqueueAgentTriggerDelivery(enqueueInput({ user }));
    await methods.prepareAgentTriggerUserPurge(user, fenceStartedAt);
    await User.updateOne({ _id: user }, { $unset: { agentTriggerDeletionStartedAt: 1 } });

    await expect(methods.recoverAgentTriggerUserPurges()).resolves.toBe(0);
    expect(await Delivery.countDocuments({ user })).toBe(1);
    expect(await UserPurge.countDocuments({ _id: user })).toBe(0);
  });

  it('lets only the exact deletion owner cancel a prepared purge', async () => {
    const user = new mongoose.Types.ObjectId();
    const fenceStartedAt = new Date(START);
    await User.create({
      _id: user,
      email: 'owner@example.com',
      provider: 'local',
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    await methods.prepareAgentTriggerUserPurge(user, fenceStartedAt);

    await expect(
      methods.cancelAgentTriggerUserPurge(user, new Date(START.getTime() + 1)),
    ).resolves.toBe(false);
    await expect(methods.cancelAgentTriggerUserPurge(user, fenceStartedAt)).resolves.toBe(true);
  });

  it('cannot disarm purge recovery after the user commit', async () => {
    const user = new mongoose.Types.ObjectId();
    const fenceStartedAt = new Date(START);
    await User.create({
      _id: user,
      email: 'committed@example.com',
      provider: 'local',
      agentTriggerDeletionStartedAt: fenceStartedAt,
    });
    await methods.prepareAgentTriggerUserPurge(user, fenceStartedAt);
    await User.deleteOne({ _id: user });

    await expect(methods.cancelAgentTriggerUserPurge(user, fenceStartedAt)).resolves.toBe(false);
    expect(await UserPurge.countDocuments({ _id: user })).toBe(1);
  });
});
