import type { Cluster } from 'ioredis';
import { RedisJobStore } from '../implementations/RedisJobStore';

jest.mock('~/cache/redisTelemetry', () => ({
  RedisUseCases: { GENERATION_STREAM: 'generation_stream' },
  instrumentIORedisClient: (client: unknown) => client,
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  expect(predicate()).toBe(true);
}

describe('RedisJobStore', () => {
  test('parallelizes Redis Cluster membership bookkeeping with ordered user TTL', async () => {
    const evalResult = createDeferred<number>();
    const runningMembership = createDeferred<number>();
    const requiresActionRemoval = createDeferred<number>();
    const userMembership = createDeferred<number>();
    const userExpiry = createDeferred<number>();
    const started: string[] = [];

    const expire = jest.fn(() => {
      started.push('user_expiry');
      return userExpiry.promise;
    });
    const redis = {
      isCluster: true,
      eval: jest.fn(() => {
        started.push('job');
        return evalResult.promise;
      }),
      sadd: jest.fn((key: string) => {
        if (key === 'stream:running') {
          started.push('running');
          return runningMembership.promise;
        }
        started.push('user');
        return userMembership.promise;
      }),
      srem: jest.fn(() => {
        started.push('requires_action');
        return requiresActionRemoval.promise;
      }),
      expire,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis, { userJobsSetTtl: 60 });

    let settled = false;
    const creating = store.createJob('stream-1', 'user-1').then((job) => {
      settled = true;
      return job;
    });

    expect(started).toEqual(['job']);
    evalResult.resolve(1);
    await waitFor(() => started.length === 4);

    expect(started).toEqual(['job', 'running', 'requires_action', 'user']);
    expect(settled).toBe(false);
    expect(expire).not.toHaveBeenCalled();

    userMembership.resolve(1);
    await waitFor(() => expire.mock.calls.length === 1);

    expect(started).toEqual(['job', 'running', 'requires_action', 'user', 'user_expiry']);
    expect(expire).toHaveBeenCalledWith('stream:user:{user-1}:jobs', 60);
    expect(settled).toBe(false);

    userExpiry.resolve(1);
    await Promise.resolve();
    expect(settled).toBe(false);

    runningMembership.resolve(1);
    await Promise.resolve();
    expect(settled).toBe(false);

    requiresActionRemoval.resolve(1);
    await expect(creating).resolves.toMatchObject({
      streamId: 'stream-1',
      userId: 'user-1',
      status: 'running',
    });
    expect(settled).toBe(true);
  });
});
