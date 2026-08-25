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
  const keyCount = Number(call[1]);
  // JOB_CREATE_LUA receives thirteen scalar arguments before its HSET pairs.
  const fields = call.slice(15 + keyCount);
  const hash = Object.fromEntries(
    Array.from({ length: fields.length / 2 }, (_, index) => [
      String(fields[index * 2]),
      String(fields[index * 2 + 1]),
    ]),
  );
  if (hash.generationProtocolVersion === '2') {
    hash.checkpointNamespace = hash.createdAt;
  }
  return hash;
}

describe('RedisJobStore', () => {
  test('marks only the exact provider segment drained', async () => {
    const evalDrain = jest.fn().mockResolvedValue(1);
    const redis = {
      isCluster: true,
      eval: evalDrain,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await expect(
      store.markProviderExecutionDrained('stream-provider-drain', 123456, 'segment-a'),
    ).resolves.toBe(true);

    const [script, keyCount, jobKey, createdAt, providerExecutionId] = evalDrain.mock.calls[0];
    expect(script).toContain('HGET", KEYS[1], "createdAt"');
    expect(script).toContain('HGET", KEYS[1], "providerExecutionId"');
    expect(script).toContain('HSET", KEYS[1], "providerDrained", "1"');
    expect([keyCount, jobKey, createdAt, providerExecutionId]).toEqual([
      1,
      'stream:{stream-provider-drain}:job',
      '123456',
      'segment-a',
    ]);
  });

  test('starts only the exact still-running initial provider segment', async () => {
    const evalBegin = jest.fn().mockResolvedValue(1);
    const redis = {
      isCluster: true,
      eval: evalBegin,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await expect(
      store.beginProviderExecution('stream-provider-begin', 123456, 'segment-a'),
    ).resolves.toBe(true);

    const [script, keyCount, jobKey, createdAt, providerExecutionId] = evalBegin.mock.calls[0];
    expect(script).toContain('HGET", KEYS[1], "status") ~= "running"');
    expect(script).toContain('HGET", KEYS[1], "providerDrained") ~= "1"');
    expect(script).toContain('HSET", KEYS[1], "providerDrained", "0"');
    expect([keyCount, jobKey, createdAt, providerExecutionId]).toEqual([
      1,
      'stream:{stream-provider-begin}:job',
      '123456',
      'segment-a',
    ]);
  });

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
      claimedSteersKey,
      parkedSteersKey,
      generationEpochKey,
      receiptsKey,
      receiptOrderKey,
      from,
      actionId,
      createdAt,
    ] = evalTransition.mock.calls[0];
    expect(script).toContain('HGET", KEYS[1], "createdAt"');
    expect(script).toContain('redis.call("DEL", KEYS[5], KEYS[6])');
    expect(script).toContain('redis.call("SET", KEYS[7]');
    expect(script).toContain(
      'redis.call("SET", KEYS[8], currentCreatedAt, "EX", ttl + generationEpochGraceTtl)',
    );
    expect(script.indexOf('local ownerUserId')).toBeLessThan(
      script.indexOf('redis.call("EXPIRE", KEYS[1], ttl)'),
    );
    expect(script).toContain('if currentTtl > ttl then ttl = currentTtl');
    expect([
      keyCount,
      jobKey,
      sequenceKey,
      chunksKey,
      runStepsKey,
      steersKey,
      claimedSteersKey,
      parkedSteersKey,
      generationEpochKey,
      receiptsKey,
      receiptOrderKey,
      from,
      actionId,
      createdAt,
    ]).toEqual([
      10,
      'stream:{stream-epoch}:job',
      'stream:{stream-epoch}:seq',
      'stream:{stream-epoch}:chunks',
      'stream:{stream-epoch}:runsteps',
      'stream:{stream-epoch}:steers',
      'stream:{stream-epoch}:steers-claimed',
      'stream:{stream-epoch}:parked',
      'stream:{stream-epoch}:generation-epoch',
      'stream:{stream-epoch}:steer-receipts',
      'stream:{stream-epoch}:steer-receipt-order',
      'running',
      '',
      '123456',
    ]);
  });

  test('retains a terminal persistence barrier when completed TTL is zero', async () => {
    const evalTransition = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalTransition,
      hgetall: jest.fn().mockResolvedValue({
        streamId: 'stream-terminal-barrier',
        userId: 'user-1',
        status: 'running',
        createdAt: '100',
        syncSent: '0',
      }),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis, { completedTtl: 0 });

    await expect(
      store.transitionStatus('stream-terminal-barrier', {
        from: 'running',
        to: 'aborted',
        expectCreatedAt: 100,
        patch: {
          completedAt: 200,
          terminalPersistencePending: true,
          terminalPersistenceStartedAt: 200,
        },
      }),
    ).resolves.toBe(false);

    // ARGV[4] is the terminal job TTL. The persistence owner/recovery path
    // gets five minutes even when ordinary completed records are immediate.
    expect(evalTransition.mock.calls[0][15]).toBe('300');
  });

  test('retains the generation epoch beyond the paused job TTL', async () => {
    const evalTransition = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalTransition,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis, { requiresActionTtl: 4321 });

    await store.transitionStatus('stream-paused-epoch', {
      from: 'running',
      to: 'requires_action',
      expectCreatedAt: 123456,
    });

    const transitionCall = evalTransition.mock.calls[0];
    expect(transitionCall[0]).toContain(
      'redis.call("SET", KEYS[8], currentCreatedAt, "EX", ttl + generationEpochGraceTtl)',
    );
    expect(transitionCall[15]).toBe('4621');
    expect(transitionCall[16]).toBe('0');
    expect(transitionCall[20]).toBe('300');
  });

  test('seeds the guarded epoch when reaping a legacy job without a marker', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100_000);
    const evalCommand = jest.fn().mockResolvedValue(1);
    const redis = {
      isCluster: true,
      eval: evalCommand,
      hgetall: jest
        .fn()
        .mockResolvedValueOnce({
          streamId: 'legacy-reap',
          userId: 'user-1',
          status: 'running',
          createdAt: '1',
          syncSent: '0',
        })
        .mockResolvedValue({}),
      smembers: jest.fn().mockResolvedValueOnce(['legacy-reap']).mockResolvedValueOnce([]),
      srem: jest.fn().mockResolvedValue(1),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis, { runningTtl: 60 });

    try {
      await expect(store.cleanup()).resolves.toBe(1);
    } finally {
      now.mockRestore();
    }

    const reapCall = evalCommand.mock.calls[0];
    expect(reapCall[0]).toContain('redis.call("SET", KEYS[7], ARGV[1], "EX", tonumber(ARGV[5]))');
    expect(reapCall.slice(1)).toEqual([
      9,
      'stream:{legacy-reap}:job',
      'stream:{legacy-reap}:chunks',
      'stream:{legacy-reap}:runsteps',
      'stream:{legacy-reap}:steers',
      'stream:{legacy-reap}:steers-claimed',
      'stream:{legacy-reap}:parked',
      'stream:{legacy-reap}:generation-epoch',
      'stream:{legacy-reap}:steer-receipts',
      'stream:{legacy-reap}:steer-receipt-order',
      '1',
      '100000',
      '60000',
      '300',
      '300',
    ]);
  });

  test('guards steer peeks with the expected creation epoch in one Redis script', async () => {
    const queuedSteer = {
      steerId: 'steer-1',
      text: 'keep me',
      userId: 'user-1',
      createdAt: 123,
    };
    const evalPeek = jest.fn().mockResolvedValue([JSON.stringify(queuedSteer)]);
    const lrange = jest.fn();
    const redis = {
      isCluster: true,
      eval: evalPeek,
      lrange,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await expect(store.peekSteers('stream-peek', 123)).resolves.toEqual([queuedSteer]);

    const [script, keyCount, jobKey, steersKey, expectedCreatedAt] = evalPeek.mock.calls[0];
    expect(script).toContain('HGET", KEYS[1], "createdAt"');
    expect(script).toContain('LRANGE", KEYS[2], 0, -1');
    expect([keyCount, jobKey, steersKey, expectedCreatedAt]).toEqual([
      2,
      'stream:{stream-peek}:job',
      'stream:{stream-peek}:steers',
      '123',
    ]);
    expect(lrange).not.toHaveBeenCalled();
  });

  test('writes initial metadata in the atomic job creation', async () => {
    const evalJobCreation = jest
      .fn()
      .mockImplementation((...args: unknown[]) => ['', '', args[Number(args[1]) + 3]]);
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
      mcpRequestBody: {
        messageId: 'response-1',
        conversationId: 'overridden-conversation',
        parentMessageId: 'response-1',
      },
      sender: 'Agent',
      endpoint: 'agents',
      iconURL: 'https://example.com/icon.png',
      model: 'test-model',
      agent_id: 'agent-1',
      isTemporary: false,
      scheduleId: 'schedule-1',
      scheduledFor: '2026-08-17T12:00:00.000Z',
      scheduleConfigRevision: 4,
      scheduleManual: false,
      scheduleOutcome: 'interrupted',
      scheduleOutcomeError: 'Schedule deleted',
      preserveForScheduleReconcile: true,
      promptTokens: 0,
      discoveredTools: [],
      preemptCapable: true,
      steerQuotesExecutionId: 'exec-1',
      generationProtocolVersion: 2,
      resolvedAskUserQuestions: [
        {
          request: { question: 'Deploy where?' },
          output: 'prod',
          toolCallId: 'call-1',
        },
        {
          request: { question: 'Legacy missing?' },
          output: 'yes',
          contentMissing: true,
        },
      ],
    });

    /**
     * `serializeJob` writes every boolean generically but `deserializeJob` is
     * an explicit field map, so a new flag silently vanishes on read unless
     * it is added there too. For `preemptCapable` that meant interrupt-steer
     * degrading to ordinary steering in every Redis deployment.
     */
    expect(job.preemptCapable).toBe(true);
    expect(job.steerQuotesExecutionId).toBe('exec-1');
    expect(job.generationProtocolVersion).toBe(2);
    expect(job.checkpointNamespace).toBe(String(job.createdAt));
    expect(job.resolvedAskUserQuestions).toEqual([
      {
        request: { question: 'Deploy where?' },
        output: 'prod',
        toolCallId: 'call-1',
      },
      {
        request: { question: 'Legacy missing?' },
        output: 'yes',
        contentMissing: true,
      },
    ]);

    expect(job).toMatchObject({
      streamId: 'stream-metadata',
      userId: 'user-1',
      conversationId: 'conversation-1',
      userMessage: {
        messageId: 'message-1',
        parentMessageId: 'parent-1',
      },
      responseMessageId: 'response-1',
      mcpRequestBody: {
        messageId: 'response-1',
        conversationId: 'overridden-conversation',
        parentMessageId: 'response-1',
      },
      sender: 'Agent',
      endpoint: 'agents',
      iconURL: 'https://example.com/icon.png',
      model: 'test-model',
      agent_id: 'agent-1',
      isTemporary: false,
      scheduleId: 'schedule-1',
      scheduledFor: '2026-08-17T12:00:00.000Z',
      scheduleConfigRevision: 4,
      scheduleManual: false,
      scheduleOutcome: 'interrupted',
      scheduleOutcomeError: 'Schedule deleted',
      preserveForScheduleReconcile: true,
      promptTokens: 0,
      discoveredTools: [],
      resolvedAskUserQuestions: [
        {
          request: { question: 'Deploy where?' },
          output: 'prod',
          toolCallId: 'call-1',
        },
        {
          request: { question: 'Legacy missing?' },
          output: 'yes',
          contentMissing: true,
        },
      ],
    });

    const creationArgs = evalJobCreation.mock.calls[0];
    const storedFields = jobHashFromCreationCall(creationArgs);
    expect(storedFields).toMatchObject({
      conversationId: 'conversation-1',
      responseMessageId: 'response-1',
      mcpRequestBody: JSON.stringify({
        messageId: 'response-1',
        conversationId: 'overridden-conversation',
        parentMessageId: 'response-1',
      }),
      agent_id: 'agent-1',
      isTemporary: '0',
      scheduleId: 'schedule-1',
      scheduledFor: '2026-08-17T12:00:00.000Z',
      scheduleConfigRevision: '4',
      scheduleManual: '0',
      scheduleOutcome: 'interrupted',
      scheduleOutcomeError: 'Schedule deleted',
      preserveForScheduleReconcile: '1',
      promptTokens: '0',
      discoveredTools: '[]',
      resolvedAskUserQuestions: JSON.stringify([
        {
          request: { question: 'Deploy where?' },
          output: 'prod',
          toolCallId: 'call-1',
        },
        {
          request: { question: 'Legacy missing?' },
          output: 'yes',
          contentMissing: true,
        },
      ]),
    });
  });

  test.each([
    'null',
    '42',
    '"answer"',
    '{}',
    '[]',
    '[null]',
    '[{"request":"Question?","output":"answer","contentIndex":-1}]',
    '[{"request":"Question?","output":"answer","contentMissing":false}]',
  ])('drops malformed resolved ask-user metadata: %s', async (resolvedAskUserQuestions) => {
    const redis = {
      isCluster: true,
      hgetall: jest.fn().mockResolvedValue({
        streamId: 'stream-malformed-answer',
        userId: 'user-1',
        status: 'running',
        createdAt: '100',
        resolvedAskUserQuestions,
      }),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await expect(store.getJob('stream-malformed-answer')).resolves.toMatchObject({
      streamId: 'stream-malformed-answer',
      resolvedAskUserQuestions: undefined,
    });
  });

  test('atomically resets predecessor state when creating a replacement', async () => {
    const evalJobCreation = jest
      .fn()
      .mockImplementation((...args: unknown[]) => [
        'user-1',
        '',
        args[Number(args[1]) + 3],
        '',
        '1',
        'running',
        'conversation-before-replacement',
        '1',
        'provider-before-replacement',
        '0',
      ]);
    const redis = {
      isCluster: true,
      eval: evalJobCreation,
      hgetall: jest.fn(() => jobHashFromCreationCall(evalJobCreation.mock.calls[0])),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);
    store.setCollectedUsage('stream-replacement', [{ input_tokens: 10 }]);

    const replacement = await store.createJob('stream-replacement', 'user-1');

    expect(replacement.replacedJob).toMatchObject({
      createdAt: 1,
      status: 'running',
      conversationId: 'conversation-before-replacement',
      providerAbortReady: true,
      providerExecutionId: 'provider-before-replacement',
      providerDrained: false,
    });

    const [script, keyCount, ...args] = evalJobCreation.mock.calls[0];
    expect(script).toContain(
      'local retainedEpochRaw = redis.call("GET", KEYS[7]) local retainedEpoch = tonumber(retainedEpochRaw)',
    );
    expect(script).toContain('if retainedEpochRaw and not isSafeEpoch(retainedEpoch) then');
    expect(script).toContain(
      'if previousCreatedAt and previousCreatedAt >= createdAt then createdAt = previousCreatedAt + 1 end',
    );
    expect(script).toContain('"checkpointNamespace", tostring(createdAt)');
    expect(script).toContain('redis.call("DEL", KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5])');
    expect(script).toContain(
      'redis.call("SET", KEYS[7], tostring(createdAt), "EX", ttl + generationEpochGraceTtl)',
    );
    expect([keyCount, ...args.slice(0, 10)]).toEqual([
      10,
      'stream:{stream-replacement}:job',
      'stream:{stream-replacement}:chunks',
      'stream:{stream-replacement}:runsteps',
      'stream:{stream-replacement}:steers',
      'stream:{stream-replacement}:steers-claimed',
      'stream:{stream-replacement}:parked',
      'stream:{stream-replacement}:generation-epoch',
      'stream:{stream-replacement}:steer-receipts',
      'stream:{stream-replacement}:steer-receipt-order',
      'stream:{stream-replacement}:job',
    ]);
    expect(args[12]).toBe('300');
    expect(args[13]).toBe('300');
    expect(store.getCollectedUsage('stream-replacement')).toEqual([]);
  });

  test('an older overlapping create cannot clear a newer local cache', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(100);
    const redis = {
      isCluster: true,
      eval: jest.fn().mockResolvedValue(['user-1', '', '100']),
      hgetall: jest.fn().mockResolvedValue({
        streamId: 'stream-overlap',
        userId: 'user-1',
        status: 'running',
        createdAt: '101',
        syncSent: '0',
      }),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);
    const newerUsage = [{ input_tokens: 20 }];
    store.setCollectedUsage('stream-overlap', newerUsage, 101);

    try {
      await expect(store.createJob('stream-overlap', 'user-1')).rejects.toThrow(
        'Generation job was replaced during creation',
      );
      expect(store.getCollectedUsage('stream-overlap', 101)).toBe(newerUsage);
      expect(store.getCollectedUsage('stream-overlap', 100)).toEqual([]);
    } finally {
      now.mockRestore();
    }
  });

  test('rejects creation when its durable epoch is already terminal', async () => {
    const redis = {
      isCluster: true,
      eval: jest.fn().mockResolvedValue(['', '', '100']),
      hgetall: jest.fn().mockResolvedValue({
        streamId: 'stream-terminal-create',
        userId: 'user-1',
        status: 'complete',
        createdAt: '100',
        syncSent: '0',
      }),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);

    await expect(store.createJob('stream-terminal-create', 'user-1')).rejects.toThrow(
      'Generation job was replaced during creation',
    );
  });

  test('guards local content caches by creation epoch', async () => {
    const evalRedis = jest.fn().mockResolvedValue(false);
    const redis = {
      isCluster: true,
      eval: evalRedis,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);
    const replacementContent = [{ type: 'text', text: 'replacement' }];
    const replacementUsage = [{ input_tokens: 20 }];
    const replacementGraph = {
      getContentParts: () => replacementContent,
      getRunSteps: () => [{ id: 'replacement-step' }],
    };
    const staleGraph = {
      getContentParts: () => [{ type: 'text', text: 'predecessor' }],
      getRunSteps: () => [{ id: 'predecessor-step' }],
    };

    store.setContentParts('stream-local-epoch', replacementContent, 101);
    store.setCollectedUsage('stream-local-epoch', replacementUsage, 101);
    store.setGraph('stream-local-epoch', replacementGraph as never, 101);

    store.setContentParts('stream-local-epoch', [{ type: 'text', text: 'predecessor' }], 100);
    store.setCollectedUsage('stream-local-epoch', [{ input_tokens: 10 }], 100);
    store.setGraph('stream-local-epoch', staleGraph as never, 100);
    store.setCollectedUsage('stream-local-epoch', [{ input_tokens: 30 }]);
    store.clearContentState('stream-local-epoch', 100);

    await expect(store.getContentParts('stream-local-epoch', 101)).resolves.toEqual({
      content: replacementContent,
    });
    expect(store.getCollectedUsage('stream-local-epoch', 101)).toBe(replacementUsage);
    await expect(store.getRunSteps('stream-local-epoch', 101)).resolves.toEqual([
      { id: 'replacement-step' },
    ]);
    await expect(store.getContentParts('stream-local-epoch', 100)).resolves.toBeNull();
    expect(store.getCollectedUsage('stream-local-epoch', 100)).toEqual([]);
    await expect(store.getRunSteps('stream-local-epoch', 100)).resolves.toEqual([]);

    store.clearContentState('stream-local-epoch', 101);
    await expect(store.getContentParts('stream-local-epoch', 101)).resolves.toBeNull();
    expect(store.getCollectedUsage('stream-local-epoch', 101)).toEqual([]);

    const chunkRead = evalRedis.mock.calls.find(([script]) => String(script).includes('XRANGE'));
    expect(chunkRead).toEqual([
      expect.stringContaining('HGET", KEYS[1], "createdAt"'),
      2,
      'stream:{stream-local-epoch}:job',
      'stream:{stream-local-epoch}:chunks',
      '100',
    ]);
    const runStepsRead = evalRedis.mock.calls.find(([script]) =>
      String(script).includes('GET", KEYS[2]'),
    );
    expect(runStepsRead).toEqual([
      expect.stringContaining('HGET", KEYS[1], "createdAt"'),
      2,
      'stream:{stream-local-epoch}:job',
      'stream:{stream-local-epoch}:runsteps',
      '100',
    ]);
  });

  test('parallelizes Redis Cluster membership bookkeeping with ordered user TTL', async () => {
    const evalResult = createDeferred<number>();
    const runningMembership = createDeferred<number>();
    const requiresActionRemoval = createDeferred<number>();
    const terminalHostActionRemoval = createDeferred<number>();
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
      srem: jest.fn((key: string) => {
        if (key === 'stream:requires_action') {
          started.push('requires_action');
          return requiresActionRemoval.promise;
        }
        started.push('terminal_host_action');
        return terminalHostActionRemoval.promise;
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
    await waitFor(() => started.length === 5);

    expect(started).toEqual(['job', 'running', 'requires_action', 'terminal_host_action', 'user']);
    expect(settled).toBe(false);
    expect(expire).not.toHaveBeenCalled();

    userMembership.resolve(1);
    await waitFor(() => expire.mock.calls.length === 1);

    expect(started).toEqual([
      'job',
      'running',
      'requires_action',
      'terminal_host_action',
      'user',
      'user_expiry',
    ]);
    expect(expire).toHaveBeenCalledWith('stream:user:{user-1}:jobs', 60);
    expect(settled).toBe(false);

    userExpiry.resolve(1);
    await Promise.resolve();
    expect(settled).toBe(false);

    runningMembership.resolve(1);
    await Promise.resolve();
    expect(settled).toBe(false);

    terminalHostActionRemoval.resolve(1);
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
      5,
      'stream:{stream-guarded}:job',
      'stream:{stream-guarded}:chunks',
      'stream:{stream-guarded}:runsteps',
      'stream:{stream-guarded}:steers',
      'stream:{stream-guarded}:steers-claimed',
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
    expect(appendCall[0]).toContain('currentCreatedAt ~= ARGV[3]');
    expect(appendCall[0]).toContain('currentStatus ~= "running"');
    expect(appendCall[0]).toContain('currentStatus ~= "requires_action"');
    expect(appendCall[0]).toContain('retainedEpoch ~= currentCreatedAt');
    expect(appendCall[0]).toContain('redis.call("EXPIRE", KEYS[8], epochTarget)');
    expect(appendCall.slice(1)).toEqual([
      8,
      'stream:{stream-chunk-guarded}:chunks',
      'stream:{stream-chunk-guarded}:job',
      'stream:{stream-chunk-guarded}:steer-receipts',
      'stream:{stream-chunk-guarded}:steer-receipt-order',
      'stream:{stream-chunk-guarded}:steers-claimed',
      'stream:{stream-chunk-guarded}:steers',
      'stream:{stream-chunk-guarded}:parked',
      'stream:{stream-chunk-guarded}:generation-epoch',
      JSON.stringify(event),
      '1500',
      '100',
      '',
      '',
      expect.any(String),
      '300',
      '300',
    ]);
  });

  test('guards run-step saves with the expected epoch and active status inside Redis Lua', async () => {
    const evalCommand = jest.fn().mockResolvedValue(0);
    const redis = {
      isCluster: true,
      eval: evalCommand,
    } as unknown as Cluster;
    const store = new RedisJobStore(redis);
    const runSteps = [{ id: 'step-1', type: 'tool_call' }];

    await store.saveRunSteps?.('stream-runstep-guarded', runSteps as never, 100);

    const saveCall = evalCommand.mock.calls[0];
    expect(saveCall[0]).toContain('currentCreatedAt ~= ARGV[3]');
    expect(saveCall[0]).toContain('currentStatus ~= "running"');
    expect(saveCall[0]).toContain('currentStatus ~= "requires_action"');
    expect(saveCall.slice(1)).toEqual([
      2,
      'stream:{stream-runstep-guarded}:runsteps',
      'stream:{stream-runstep-guarded}:job',
      JSON.stringify(runSteps),
      '1500',
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

  test('in-memory replacement clears predecessor content state', async () => {
    const store = new InMemoryJobStore();
    await store.createJob('stream-memory-content', 'user-1');
    store.setContentParts('stream-memory-content', [{ type: 'text', text: 'predecessor' }]);
    store.setCollectedUsage('stream-memory-content', [{ input_tokens: 10 }]);

    await store.createJob('stream-memory-content', 'user-1');

    await expect(store.getContentParts('stream-memory-content')).resolves.toBeNull();
    expect(store.getCollectedUsage('stream-memory-content')).toEqual([]);
  });
});
