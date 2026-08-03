/**
 * abortJob must act on the generation its CALLER observed, not on whatever occupies the
 * streamId by the time the abort runs. The scheduler checks a job's scheduled identity
 * and then awaits before aborting, so an interactive turn reusing the conversation in
 * that window would otherwise receive the abort signal, terminal event and cleanup.
 */

/** Suppress winston Console transport output (survives jest.resetModules) */
jest.spyOn(console, 'log').mockImplementation();

async function makeManager() {
  const { GenerationJobManagerClass } = await import('../GenerationJobManager');
  const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
  const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
  const manager = new GenerationJobManagerClass();
  manager.configure({
    jobStore: new InMemoryJobStore({ ttlAfterComplete: 0 }),
    eventTransport: new InMemoryEventTransport(),
    isRedis: false,
  });
  manager.initialize();
  return manager;
}

describe('abortJob generation fence', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('refuses to abort when the observed generation was replaced', async () => {
    const manager = await makeManager();
    await manager.createJob('conv-1', 'user-1', 'conv-1');
    const observedCreatedAt = (await manager.getJobStore().getJob('conv-1'))?.createdAt;
    // An interactive turn reuses the conversation before the abort lands. createJob
    // signals the generation it supersedes, so the DOOMED controller is already aborted
    // here by design — the invariant under test is that the REPLACEMENT is untouched.
    const replacementJob = await manager.createJob('conv-1', 'user-1', 'conv-1');
    const replacement = await manager.getJobStore().getJob('conv-1');

    const result = await manager.abortJob('conv-1', { expectedCreatedAt: observedCreatedAt });

    // Reported as NOT delivered, so the scheduler treats the run as unconfirmed rather
    // than assuming it stopped.
    expect(result.success).toBe(false);
    // The replacement keeps running: not signalled, not torn down.
    expect(replacementJob.abortController.signal.aborted).toBe(false);
    expect((await manager.getJobStore().getJob('conv-1'))?.createdAt).toBe(replacement?.createdAt);
    expect(await manager.hasJob('conv-1')).toBe(true);
  });

  it('aborts normally when the fence matches the live generation', async () => {
    const manager = await makeManager();
    const job = await manager.createJob('conv-1', 'user-1', 'conv-1');
    const observedCreatedAt = (await manager.getJobStore().getJob('conv-1'))?.createdAt;

    const result = await manager.abortJob('conv-1', { expectedCreatedAt: observedCreatedAt });

    expect(result.success).toBe(true);
    expect(job.abortController.signal.aborted).toBe(true);
  });

  it('aborts when no fence is supplied, preserving existing callers', async () => {
    const manager = await makeManager();
    const job = await manager.createJob('conv-1', 'user-1', 'conv-1');

    const result = await manager.abortJob('conv-1');

    expect(result.success).toBe(true);
    expect(job.abortController.signal.aborted).toBe(true);
  });
});
