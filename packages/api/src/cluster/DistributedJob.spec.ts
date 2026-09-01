import type { runDistributedJob as RunDistributedJob } from './DistributedJob';

const mockLogger = {
  error: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

const claimResult = (_filter: unknown, update: { $set: { owner: string; expiresAt: Date } }) => ({
  owner: update.$set.owner,
  expiresAt: update.$set.expiresAt,
});

describe('runDistributedJob', () => {
  let runDistributedJob: typeof RunDistributedJob;
  let collection: {
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    ({ runDistributedJob } = await import('./DistributedJob'));
    collection = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };
  });

  test('atomically claims and completes a job', async () => {
    collection.findOneAndUpdate.mockImplementation(claimResult);
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const handler = jest.fn().mockResolvedValue('done');

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        handler,
      ),
    ).resolves.toBe('done');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(collection.updateOne).toHaveBeenLastCalledWith(
      {
        _id: 'test-job',
        status: 'running',
        owner: expect.any(String),
        expiresAt: { $gt: expect.any(Date) },
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed' }),
        $unset: { owner: '' },
      }),
    );
  });

  test('does not rerun a recently completed job', async () => {
    collection.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    collection.findOne.mockResolvedValue({
      status: 'completed',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const handler = jest.fn();

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        handler,
      ),
    ).resolves.toBeUndefined();

    expect(handler).not.toHaveBeenCalled();
  });

  test('retries an expired claim and takes over the job', async () => {
    collection.findOneAndUpdate
      .mockRejectedValueOnce({ code: 11000 })
      .mockImplementationOnce(claimResult);
    collection.findOne.mockResolvedValue({
      status: 'running',
      expiresAt: new Date(Date.now() - 1000),
    });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const handler = jest.fn().mockResolvedValue('recovered');

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        handler,
        { pollMs: 0 },
      ),
    ).resolves.toBe('recovered');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('waits for a failed claim to expire before retrying', async () => {
    collection.findOneAndUpdate
      .mockRejectedValueOnce({ code: 11000 })
      .mockImplementationOnce(claimResult);
    collection.findOne.mockResolvedValue({
      status: 'failed',
      expiresAt: new Date(Date.now() - 1000),
    });
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const handler = jest.fn().mockResolvedValue('retried');

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        handler,
        { pollMs: 0 },
      ),
    ).resolves.toBe('retried');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('fail-stops when lease renewal reports lost ownership', async () => {
    jest.useFakeTimers();
    collection.findOneAndUpdate.mockImplementation(claimResult);
    collection.updateOne
      .mockResolvedValueOnce({ matchedCount: 0 })
      .mockResolvedValue({ matchedCount: 1 });
    const onLeaseLost = jest.fn();
    let finish: ((value: string) => void) | undefined;
    const handler = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );

    const running = runDistributedJob(
      collection as unknown as Parameters<typeof runDistributedJob>[0],
      'test-job',
      handler,
      { refreshMs: 1000, onLeaseLost },
    );
    while (handler.mock.calls.length === 0) {
      await Promise.resolve();
    }
    await jest.advanceTimersByTimeAsync(1001);

    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    finish?.('done');
    await expect(running).rejects.toThrow('Lost distributed job lease for test-job');
    jest.useRealTimers();
  });

  test('records handler failure before propagating it', async () => {
    collection.findOneAndUpdate.mockImplementation(claimResult);
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const handler = jest.fn().mockRejectedValue(new Error('job failed'));

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        handler,
      ),
    ).rejects.toThrow('job failed');

    expect(collection.updateOne).toHaveBeenLastCalledWith(
      {
        _id: 'test-job',
        status: 'running',
        owner: expect.any(String),
        expiresAt: { $gt: expect.any(Date) },
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed' }),
        $unset: { owner: '' },
      }),
    );
  });

  test('does not complete a job after its lease expires', async () => {
    collection.findOneAndUpdate.mockImplementation(claimResult);
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const onLeaseLost = jest.fn();

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        async () => 'stale result',
        { onLeaseLost },
      ),
    ).rejects.toThrow('Lost distributed job lease for test-job');

    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    expect(collection.updateOne).toHaveBeenLastCalledWith(
      {
        _id: 'test-job',
        status: 'running',
        owner: expect.any(String),
        expiresAt: { $gt: expect.any(Date) },
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });

  test('does not record failure after its lease expires', async () => {
    collection.findOneAndUpdate.mockImplementation(claimResult);
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const onLeaseLost = jest.fn();

    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        async () => {
          throw new Error('stale failure');
        },
        { onLeaseLost },
      ),
    ).rejects.toThrow('stale failure');

    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    expect(collection.updateOne).toHaveBeenLastCalledWith(
      {
        _id: 'test-job',
        status: 'running',
        owner: expect.any(String),
        expiresAt: { $gt: expect.any(Date) },
      },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  test('waits for an in-flight renewal before completing', async () => {
    jest.useFakeTimers();
    collection.findOneAndUpdate.mockImplementation(claimResult);
    let finishRenewal: ((value: { matchedCount: number }) => void) | undefined;
    collection.updateOne
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRenewal = resolve;
          }),
      )
      .mockResolvedValueOnce({ matchedCount: 1 });
    let finishHandler: ((value: string) => void) | undefined;
    const handler = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          finishHandler = resolve;
        }),
    );
    const onLeaseLost = jest.fn();

    const running = runDistributedJob(
      collection as unknown as Parameters<typeof runDistributedJob>[0],
      'test-job',
      handler,
      { refreshMs: 1000, onLeaseLost },
    );
    await jest.advanceTimersByTimeAsync(1000);
    finishHandler?.('done');
    await Promise.resolve();

    expect(collection.updateOne).toHaveBeenCalledTimes(1);
    finishRenewal?.({ matchedCount: 1 });
    await expect(running).resolves.toBe('done');
    expect(collection.updateOne).toHaveBeenCalledTimes(2);
    expect(onLeaseLost).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('rejects timing options that cannot renew before the safety window', async () => {
    await expect(
      runDistributedJob(
        collection as unknown as Parameters<typeof runDistributedJob>[0],
        'test-job',
        async () => undefined,
        { leaseMs: 10_000, refreshMs: 5000 },
      ),
    ).rejects.toThrow('Invalid distributed job timing');

    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('uses the acquired Mongo expiry for the initial watchdog', async () => {
    jest.useFakeTimers();
    collection.findOneAndUpdate.mockImplementation(async (_filter, update) => ({
      owner: update.$set.owner,
      expiresAt: new Date(Date.now() + 6000),
    }));
    collection.updateOne.mockResolvedValue({ matchedCount: 1 });
    const onLeaseLost = jest.fn();
    let finishHandler: ((value: string) => void) | undefined;
    const handler = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          finishHandler = resolve;
        }),
    );

    const running = runDistributedJob(
      collection as unknown as Parameters<typeof runDistributedJob>[0],
      'test-job',
      handler,
      { onLeaseLost },
    );
    while (handler.mock.calls.length === 0) {
      await Promise.resolve();
    }
    await jest.advanceTimersByTimeAsync(1001);

    expect(onLeaseLost).toHaveBeenCalledTimes(1);
    finishHandler?.('done');
    await expect(running).rejects.toThrow('Lost distributed job lease for test-job');
    jest.useRealTimers();
  });
});
