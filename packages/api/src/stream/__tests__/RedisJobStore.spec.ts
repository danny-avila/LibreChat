import type { Cluster } from 'ioredis';
import { InMemoryJobStore } from '../implementations/InMemoryJobStore';
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

function jobHashFromCreationCall(call: unknown[]): Record<string, string> {
  const clearCount = Number(call[7]);
  const fields = call.slice(8 + clearCount);
  return Object.fromEntries(
    Array.from({ length: fields.length / 2 }, (_, index) => [
      String(fields[index * 2]),
      String(fields[index * 2 + 1]),
    ]),
  );
}

describe('RedisJobStore', () => {
  test('guards the atomic status transition with the expected creation epoch', async () => {
    const evalTransition = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalTransition,
      hgetall: jest.fn().mockResolvedValue({}),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await expect(
      store.transitionStatus('stream-epoch', {
        from: 'running',
        to: 'error',
        expectCreatedAt: 123456,
      }),
    ).resolves.toBe(false);

    const [
      script,
      keyCount,
      jobKey,
      sequenceKey,
      chunksKey,
      runStepsKey,
      steersKey,
      parkedSteersKey,
      from,
      actionId,
      createdAt,
    ] = evalTransition.mock.calls[0];
    expect(script).toContain('HGET", KEYS[1], "createdAt"');
    expect(script).toContain('redis.call("DEL", KEYS[5])');
    expect(script).toContain('redis.call("SET", KEYS[6]');
    expect(script.indexOf('local ownerUserId')).toBeLessThan(
      script.indexOf('redis.call("EXPIRE", KEYS[1], ttl)'),
    );
    expect([
      keyCount,
      jobKey,
      sequenceKey,
      chunksKey,
      runStepsKey,
      steersKey,
      parkedSteersKey,
      from,
      actionId,
      createdAt,
    ]).toEqual([
      6,
      'stream:{stream-epoch}:job',
      'stream:{stream-epoch}:seq',
      'stream:{stream-epoch}:chunks',
      'stream:{stream-epoch}:runsteps',
      'stream:{stream-epoch}:steers',
      'stream:{stream-epoch}:parked',
      'running',
      '',
      '123456',
    ]);
  });

  test('writes initial metadata in the atomic job creation', async () => {
    const evalJobCreation = jest.fn().mockImplementation((...args: unknown[]) => ['', '', args[6]]);
    const redis = {
      isCluster: true,
      eval: evalJobCreation,
      hgetall: jest.fn(() => jobHashFromCreationCall(evalJobCreation.mock.calls[0])),
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
    const clearCount = Number(creationArgs[7]);
    const storedFields = Object.fromEntries(
      Array.from({ length: (creationArgs.length - 8 - clearCount) / 2 }, (_, index) => [
        creationArgs[8 + clearCount + index * 2],
        creationArgs[9 + clearCount + index * 2],
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
    const evalJobCreation = jest.fn(() => {
      started.push('job');
      return evalResult.promise;
    });
    const redis = {
      isCluster: true,
      eval: evalJobCreation,
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
      hgetall: jest.fn(() => jobHashFromCreationCall(evalJobCreation.mock.calls[0])),
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

  test('reconciles membership again when the generation changes at the post-write check', async () => {
    const postWriteCheckStarted = createDeferred<void>();
    const releasePostWriteCheck = createDeferred<void>();
    const memberships = new Map<string, Set<string>>([
      ['stream:running', new Set(['stream-race'])],
      ['stream:requires_action', new Set()],
      ['stream:user:{user-old}:jobs', new Set(['stream-race'])],
      ['stream:user:{user-new}:jobs', new Set()],
    ]);
    let durableHash: Record<string, string> = {
      streamId: 'stream-race',
      userId: 'user-old',
      status: 'running',
      createdAt: '100',
      syncSent: '0',
    };
    let reads = 0;
    const hgetall = jest.fn(async () => {
      reads++;
      if (reads === 2) {
        postWriteCheckStarted.resolve();
        await releasePostWriteCheck.promise;
      }
      return { ...durableHash };
    });
    const sadd = jest.fn(async (key: string, streamId: string) => {
      let members = memberships.get(key);
      if (!members) {
        members = new Set();
        memberships.set(key, members);
      }
      members.add(streamId);
      return 1;
    });
    const srem = jest.fn(async (key: string, streamId: string) => {
      memberships.get(key)?.delete(streamId);
      return 1;
    });
    const redis = {
      isCluster: true,
      eval: jest.fn(async () => {
        durableHash = { ...durableHash, status: 'requires_action' };
        return 1;
      }),
      hgetall,
      sadd,
      srem,
      expire: jest.fn().mockResolvedValue(1),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    const transitioning = store.transitionStatus('stream-race', {
      from: 'running',
      to: 'requires_action',
    });
    await postWriteCheckStarted.promise;

    durableHash = {
      streamId: 'stream-race',
      userId: 'user-new',
      status: 'running',
      createdAt: '200',
      syncSent: '0',
    };
    releasePostWriteCheck.resolve();

    await expect(transitioning).resolves.toBe(true);
    expect(reads).toBe(3);
    expect(memberships.get('stream:running')).toContain('stream-race');
    expect(memberships.get('stream:requires_action')).not.toContain('stream-race');
    expect(memberships.get('stream:user:{user-old}:jobs')).not.toContain('stream-race');
    expect(memberships.get('stream:user:{user-new}:jobs')).toContain('stream-race');
  });

  test('passes expected creation epochs to atomic Redis update and delete scripts', async () => {
    const evalCommand = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalCommand,
      hgetall: jest.fn().mockResolvedValue({
        streamId: 'stream-guarded',
        userId: 'user-1',
        status: 'running',
        createdAt: '200',
        syncSent: '0',
      }),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await store.updateJob('stream-guarded', { error: 'late predecessor error' }, 100);
    await expect(store.deleteJob('stream-guarded', 100)).resolves.toBe(false);

    const updateCall = evalCommand.mock.calls[0];
    expect(updateCall[0]).toContain('HGET", KEYS[1], "createdAt"');
    expect(updateCall[6]).toBe('100');
    const deleteCall = evalCommand.mock.calls[1];
    expect(deleteCall[0]).toContain('HGET", KEYS[1], "createdAt"');
    expect(deleteCall.slice(1)).toEqual([
      4,
      'stream:{stream-guarded}:job',
      'stream:{stream-guarded}:chunks',
      'stream:{stream-guarded}:runsteps',
      'stream:{stream-guarded}:steers',
      '100',
      '0',
    ]);
  });

  test('guards chunk appends with the expected creation epoch inside Redis Lua', async () => {
    const evalCommand = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalCommand,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);
    const event = { event: 'on_message_delta', data: { text: 'stale' } };

    await store.appendChunk('stream-chunk-guarded', event, 100);

    const appendCall = evalCommand.mock.calls[0];
    expect(appendCall[0]).toContain('redis.call("HGET", KEYS[2], "createdAt") ~= ARGV[3]');
    expect(appendCall.slice(1)).toEqual([
      2,
      'stream:{stream-chunk-guarded}:chunks',
      'stream:{stream-chunk-guarded}:job',
      JSON.stringify(event),
      '1200',
      '100',
    ]);
  });

  test('guards run-step saves with the expected creation epoch inside Redis Lua', async () => {
    const evalCommand = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalCommand,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);
    const runSteps = [{ id: 'step-1', type: 'tool_call' }];

    await store.saveRunSteps?.('stream-runstep-guarded', runSteps as never, 100);

    const saveCall = evalCommand.mock.calls[0];
    expect(saveCall[0]).toContain('redis.call("HGET", KEYS[2], "createdAt") ~= ARGV[3]');
    expect(saveCall.slice(1)).toEqual([
      2,
      'stream:{stream-runstep-guarded}:runsteps',
      'stream:{stream-runstep-guarded}:job',
      JSON.stringify(runSteps),
      '1200',
      '100',
    ]);
  });

  test('guards asynchronous content cleanup against a replacement epoch', async () => {
    const evalCommand = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalCommand,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    store.clearContentState('stream-content-guarded', 100);
    await waitFor(() => evalCommand.mock.calls.length === 1);

    const clearCall = evalCommand.mock.calls[0];
    expect(clearCall[0]).toContain('redis.call("EXISTS", KEYS[3]) == 1');
    expect(clearCall.slice(1)).toEqual([
      3,
      'stream:{stream-content-guarded}:chunks',
      'stream:{stream-content-guarded}:runsteps',
      'stream:{stream-content-guarded}:job',
      '100',
    ]);
  });

  test('in-memory update and delete guards preserve a replacement epoch', async () => {
    const now = jest.spyOn(Date, 'now');
    try {
      const store = new InMemoryJobStore();
      now.mockReturnValue(100);
      const original = await store.createJob('stream-memory-guard', 'user-1');
      now.mockReturnValue(200);
      const replacement = await store.createJob('stream-memory-guard', 'user-1');

      await store.updateJob(
        'stream-memory-guard',
        { error: 'late predecessor error' },
        original.createdAt,
      );
      await expect(store.deleteJob('stream-memory-guard', original.createdAt)).resolves.toBe(false);
      await expect(store.getJob('stream-memory-guard')).resolves.toMatchObject({
        createdAt: replacement.createdAt,
        status: 'running',
      });
      await expect(store.deleteJob('stream-memory-guard', replacement.createdAt)).resolves.toBe(
        true,
      );
    } finally {
      now.mockRestore();
    }
  });

  test('in-memory replacement advances the creation epoch when the clock does not', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100);
    try {
      const store = new InMemoryJobStore({ maxJobs: 1 });
      const original = await store.createJob('stream-memory-collision', 'user-1');
      const replacement = await store.createJob('stream-memory-collision', 'user-1');

      expect(original.createdAt).toBe(100);
      expect(replacement.createdAt).toBe(101);
      await expect(store.getJob('stream-memory-collision')).resolves.toMatchObject({
        createdAt: 101,
      });
    } finally {
      now.mockRestore();
    }
  });
});
