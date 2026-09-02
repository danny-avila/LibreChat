import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Collection, Document } from 'mongodb';
import { runDistributedJob } from './job';

interface JobState extends Document {
  _id: string;
  status: 'running' | 'completed' | 'failed';
  owner?: string;
  expiresAt: Date;
  updatedAt: Date;
}

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('runDistributedJob', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let collection: Collection<JobState>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = await MongoClient.connect(mongoServer.getUri());
    collection = mongoClient.db('distributed-job-tests').collection<JobState>('jobs');
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await collection.deleteMany({});
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  test('allows only one handler to run under concurrent claims', async () => {
    const ownerStarted = createDeferred<void>();
    const releaseOwner = createDeferred<void>();
    const ownerHandler = jest.fn(async () => {
      ownerStarted.resolve();
      await releaseOwner.promise;
      return 'owner';
    });
    const followerHandler = jest.fn(async () => 'follower');
    const options = { pollMs: 5, onLeaseLost: jest.fn() };

    const ownerRun = runDistributedJob(collection, 'contended-job', ownerHandler, options);
    await ownerStarted.promise;
    const followerRun = runDistributedJob(collection, 'contended-job', followerHandler, options);
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseOwner.resolve();

    await expect(Promise.all([ownerRun, followerRun])).resolves.toEqual(['owner', undefined]);
    expect(ownerHandler).toHaveBeenCalledTimes(1);
    expect(followerHandler).not.toHaveBeenCalled();
  });

  test('takes over an expired lease', async () => {
    await collection.insertOne({
      _id: 'expired-job',
      status: 'running',
      owner: 'stale-owner',
      expiresAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 1000),
    });
    const handler = jest.fn(async () => 'recovered');

    await expect(
      runDistributedJob(collection, 'expired-job', handler, {
        pollMs: 5,
        onLeaseLost: jest.fn(),
      }),
    ).resolves.toBe('recovered');

    expect(handler).toHaveBeenCalledTimes(1);
    await expect(collection.findOne({ _id: 'expired-job' })).resolves.toMatchObject({
      status: 'completed',
    });
  });

  test('skips a job with a valid completion marker', async () => {
    await collection.insertOne({
      _id: 'completed-job',
      status: 'completed',
      expiresAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    });
    const handler = jest.fn(async () => 'unexpected');

    await expect(
      runDistributedJob(collection, 'completed-job', handler, {
        pollMs: 5,
        onLeaseLost: jest.fn(),
      }),
    ).resolves.toBeUndefined();

    expect(handler).not.toHaveBeenCalled();
  });

  test('does not complete after the owner lease expires', async () => {
    const handlerStarted = createDeferred<void>();
    const releaseHandler = createDeferred<void>();
    const onLeaseLost = jest.fn();
    const running = runDistributedJob(
      collection,
      'stale-completion',
      async () => {
        handlerStarted.resolve();
        await releaseHandler.promise;
        return 'stale result';
      },
      { onLeaseLost },
    );
    await handlerStarted.promise;
    await collection.updateOne(
      { _id: 'stale-completion', status: 'running' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    releaseHandler.resolve();

    await expect(running).rejects.toThrow('Lost distributed job lease for stale-completion');
    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    await expect(collection.findOne({ _id: 'stale-completion' })).resolves.toMatchObject({
      status: 'running',
    });
  });

  test('does not record failure after the owner lease expires', async () => {
    const handlerStarted = createDeferred<void>();
    const releaseHandler = createDeferred<void>();
    const onLeaseLost = jest.fn();
    const running = runDistributedJob(
      collection,
      'stale-failure',
      async () => {
        handlerStarted.resolve();
        await releaseHandler.promise;
        throw new Error('handler failed');
      },
      { onLeaseLost },
    );
    await handlerStarted.promise;
    await collection.updateOne(
      { _id: 'stale-failure', status: 'running' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    releaseHandler.resolve();

    await expect(running).rejects.toThrow('handler failed');
    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    await expect(collection.findOne({ _id: 'stale-failure' })).resolves.toMatchObject({
      status: 'running',
    });
  });

  test('detects ownership loss during lease renewal', async () => {
    const handlerStarted = createDeferred<void>();
    const releaseHandler = createDeferred<void>();
    const leaseLost = createDeferred<void>();
    const onLeaseLost = jest.fn(() => leaseLost.resolve());
    const running = runDistributedJob(
      collection,
      'renewal-loss',
      async () => {
        handlerStarted.resolve();
        await releaseHandler.promise;
        return 'stale result';
      },
      { leaseMs: 6000, refreshMs: 50, onLeaseLost },
    );
    await handlerStarted.promise;
    await collection.updateOne(
      { _id: 'renewal-loss', status: 'running' },
      { $set: { owner: 'replacement-owner' } },
    );
    await leaseLost.promise;
    releaseHandler.resolve();

    await expect(running).rejects.toThrow('Lost distributed job lease for renewal-loss');
    expect(onLeaseLost).toHaveBeenCalledTimes(1);
  });

  test('rejects timing options without a lease safety window', async () => {
    await expect(
      runDistributedJob(collection, 'invalid-timing', async () => undefined, {
        leaseMs: 10_000,
        refreshMs: 5000,
      }),
    ).rejects.toThrow('Invalid distributed job timing');

    await expect(collection.countDocuments({})).resolves.toBe(0);
  });
});
