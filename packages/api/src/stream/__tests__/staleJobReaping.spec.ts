/**
 * Tests for the stale running-job failsafe that prevents abandoned/hung
 * generations from leaking their content state in memory until the process OOMs.
 *
 * - InMemoryJobStore reaps jobs stuck in "running" past `staleJobTimeout`
 *   (mirrors RedisJobStore's running-job TTL).
 * - GenerationJobManager aborts the in-flight generation when its job is reaped
 *   or replaced, so client/graph references can be garbage collected.
 *
 * @see https://github.com/danny-avila/LibreChat/issues/13391
 */

/** Suppress winston Console transport output (survives jest.resetModules) */
jest.spyOn(console, 'log').mockImplementation();

describe('InMemoryJobStore - stale running-job failsafe', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('reaps a running job older than staleJobTimeout', async () => {
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const store = new InMemoryJobStore({ ttlAfterComplete: 0, staleJobTimeout: 1000 });
    await store.initialize();

    await store.createJob('s1', 'u1', 's1');
    await store.updateJob('s1', { createdAt: Date.now() - 5000 });

    const removed = await store.cleanup();

    expect(removed).toBe(1);
    expect(await store.hasJob('s1')).toBe(false);

    await store.destroy();
  });

  it('does not reap a running job within the staleJobTimeout', async () => {
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const store = new InMemoryJobStore({ staleJobTimeout: 60000 });
    await store.initialize();

    await store.createJob('s1', 'u1', 's1');

    const removed = await store.cleanup();

    expect(removed).toBe(0);
    expect(await store.hasJob('s1')).toBe(true);

    await store.destroy();
  });

  it('treats staleJobTimeout=0 as disabling the running-job failsafe', async () => {
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const store = new InMemoryJobStore({ staleJobTimeout: 0 });
    await store.initialize();

    await store.createJob('s1', 'u1', 's1');
    await store.updateJob('s1', { createdAt: Date.now() - 3_600_000 });

    const removed = await store.cleanup();

    expect(removed).toBe(0);
    expect(await store.hasJob('s1')).toBe(true);

    await store.destroy();
  });

  it('removes per-user tracking when reaping a stale running job', async () => {
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const store = new InMemoryJobStore({ staleJobTimeout: 1000 });
    await store.initialize();

    await store.createJob('s1', 'u1', 's1');
    expect(await store.getActiveJobIdsByUser('u1')).toEqual(['s1']);

    await store.updateJob('s1', { createdAt: Date.now() - 5000 });
    await store.cleanup();

    expect(await store.getActiveJobIdsByUser('u1')).toEqual([]);
    expect(await store.getJobCount()).toBe(0);

    await store.destroy();
  });

  it('reaps terminal jobs while leaving fresh running jobs intact', async () => {
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const store = new InMemoryJobStore({ ttlAfterComplete: 0, staleJobTimeout: 60000 });
    await store.initialize();

    await store.createJob('done', 'u1', 'done');
    await store.updateJob('done', { status: 'complete', completedAt: Date.now() });
    await store.createJob('live', 'u1', 'live');

    const removed = await store.cleanup();

    expect(removed).toBe(1);
    expect(await store.hasJob('done')).toBe(false);
    expect(await store.hasJob('live')).toBe(true);

    await store.destroy();
  });
});

describe('GenerationJobManager - generation abort on replacement and reaping', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('aborts the previous generation when a job is replaced for the same stream', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 0, staleJobTimeout: 60000 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();

    const first = await manager.createJob('conv-1', 'user-1', 'conv-1');
    expect(first.abortController.signal.aborted).toBe(false);

    const second = await manager.createJob('conv-1', 'user-1', 'conv-1');

    expect(first.abortController.signal.aborted).toBe(true);
    expect(second.abortController.signal.aborted).toBe(false);

    await manager.destroy();
  });

  it('aborts and cleans up a hung running job once the store reaps it', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');

    jest.useFakeTimers();
    try {
      const manager = new GenerationJobManagerClass();
      manager.configure({
        jobStore: new InMemoryJobStore({ ttlAfterComplete: 0, staleJobTimeout: 1000 }),
        eventTransport: new InMemoryEventTransport(),
        isRedis: false,
      });
      manager.initialize();

      const job = await manager.createJob('conv-2', 'user-1', 'conv-2');
      expect(await manager.hasJob('conv-2')).toBe(true);
      expect(job.abortController.signal.aborted).toBe(false);

      // Advance past the stale timeout + the 60s cleanup interval.
      await jest.advanceTimersByTimeAsync(61000);

      expect(job.abortController.signal.aborted).toBe(true);
      expect(await manager.hasJob('conv-2')).toBe(false);
      expect(manager.getRuntimeStats().runtimeStateSize).toBe(0);
      expect(manager.getRuntimeStats().eventTransportStreams).toBe(0);

      await manager.destroy();
    } finally {
      jest.useRealTimers();
    }
  });
});
