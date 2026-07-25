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
  test('writes initial metadata in the atomic job creation', async () => {
    const evalJobCreation = jest.fn().mockResolvedValue(1);
    const redis = {
      isCluster: true,
      eval: evalJobCreation,
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    const job = await store.createJob('stream-metadata', 'user-1', 'conversation-1', undefined, {
      conversationId: 'untrusted-conversation',
      userMessage: {
        messageId: 'message-1',
        parentMessageId: 'parent-1',
      },
      responseMessageId: 'response-1',
      sender: 'Agent',
      endpoint: 'agents',
      iconURL: 'https://example.com/icon.png',
      model: 'test-model',
      agent_id: 'agent-1',
      isTemporary: false,
      promptTokens: 0,
      discoveredTools: [],
    });

    expect(job).toMatchObject({
      streamId: 'stream-metadata',
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: {
        messageId: 'message-1',
        parentMessageId: 'parent-1',
      },
      responseMessageId: 'response-1',
      sender: 'Agent',
      endpoint: 'agents',
      iconURL: 'https://example.com/icon.png',
      model: 'test-model',
      agent_id: 'agent-1',
      isTemporary: false,
      promptTokens: 0,
      discoveredTools: [],
    });

    const creationArgs = evalJobCreation.mock.calls[0];
    const clearCount = Number(creationArgs[6]);
    const storedFields = Object.fromEntries(
      Array.from({ length: (creationArgs.length - 7 - clearCount) / 2 }, (_, index) => [
        creationArgs[7 + clearCount + index * 2],
        creationArgs[8 + clearCount + index * 2],
      ]),
    );
    expect(storedFields).toMatchObject({
      conversationId: 'conversation-1',
      responseMessageId: 'response-1',
      agent_id: 'agent-1',
      isTemporary: '0',
      promptTokens: '0',
      discoveredTools: '[]',
    });
  });

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
