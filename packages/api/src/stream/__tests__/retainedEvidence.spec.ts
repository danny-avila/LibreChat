/**
 * Retained-evidence integrity, store-level. Three properties the reconciler's
 * recovery depends on: a scheduled fire's failed-pause error terminal must be
 * RETAINED (no completedAt — the retention signal), the owner must be able to
 * refresh a stale outcome stamp after its response persistence fails, and a store
 * written against the pre-marker contract must still configure and degrade
 * coherently instead of crashing account deletion.
 */

/** Suppress winston Console transport output (survives jest.resetModules) */
jest.spyOn(console, 'log').mockImplementation();

async function makeEvidenceManager(mutateStore?: (store: object) => void) {
  const { GenerationJobManagerClass } = await import('../GenerationJobManager');
  const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
  const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
  const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
  mutateStore?.(jobStore);
  const manager = new GenerationJobManagerClass();
  manager.configure({ jobStore, eventTransport: new InMemoryEventTransport(), isRedis: false });
  manager.initialize();
  return { manager, jobStore };
}

type Harness = Awaited<ReturnType<typeof makeEvidenceManager>>;

async function pauseBehindPersistenceBarrier(
  { jobStore }: Harness,
  streamId: string,
  actionId: string,
) {
  const { pausePersistenceActionId } = await import('../ApprovalLifecycle');
  const live = await jobStore.getJob(streamId);
  await jobStore.transitionStatus(streamId, {
    from: 'running',
    to: 'requires_action',
    expectCreatedAt: live!.createdAt,
    patch: {
      pendingAction: {
        actionId,
        streamId,
        createdAt: 1,
        payload: { type: 'tool_approval', action_requests: [], review_configs: [] },
      },
      pendingActionId: pausePersistenceActionId(actionId),
      terminalPersistencePending: true,
    },
  });
  return live!.createdAt;
}

describe('failed-pause evidence retention', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('retains a scheduled failed pause without completedAt, stamped with the error outcome', async () => {
    const harness = await makeEvidenceManager();
    const { manager, jobStore } = harness;
    await manager.createJob('conv-1', 'user-1', 'conv-1', {
      initialMetadata: { scheduleId: 'sched-1', scheduledFor: '2026-07-26T12:00:00.000Z' },
    });
    const createdAt = await pauseBehindPersistenceBarrier(harness, 'conv-1', 'act-1');

    const failed = await manager.failPausePersistence(
      'conv-1',
      'act-1',
      'Paused response could not be persisted',
      createdAt,
      {
        preserveForReconcile: true,
        scheduleOutcome: { status: 'error', error: 'Paused response could not be persisted' },
      },
    );

    expect(failed).toBe(true);
    const job = await jobStore.getJob('conv-1');
    expect(job?.status).toBe('error');
    // completedAt-less is the cross-store retention signal: WITH it, the ordinary
    // short completed TTL reaps this evidence during any longer Mongo outage and the
    // reconciler misreads the vanished run as `interrupted` instead of `error`.
    expect(job?.completedAt).toBeUndefined();
    expect(job?.scheduleOutcome).toBe('error');
    expect(job?.scheduleOutcomeError).toBe('Paused response could not be persisted');
  });

  it('keeps the ordinary completed lifecycle for an interactive failed pause', async () => {
    const harness = await makeEvidenceManager();
    const { manager, jobStore } = harness;
    await manager.createJob('conv-2', 'user-1', 'conv-2');
    const createdAt = await pauseBehindPersistenceBarrier(harness, 'conv-2', 'act-2');

    const failed = await manager.failPausePersistence('conv-2', 'act-2', 'save failed', createdAt);

    expect(failed).toBe(true);
    // The non-retained path: `completedAt` is stamped, which is what routes the job
    // onto the ordinary short completed TTL instead of the retained-evidence hold.
    const job = await jobStore.getJob('conv-2');
    expect(job?.status).toBe('error');
    expect(typeof job?.completedAt).toBe('number');
    expect(job?.scheduleOutcome).toBeUndefined();
  });
});

describe('updateScheduleOutcome', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('refreshes a stale success stamp on a retained terminal, identity-fenced', async () => {
    const { manager, jobStore } = await makeEvidenceManager();
    await manager.createJob('conv-3', 'user-1', 'conv-3', {
      initialMetadata: { scheduleId: 'sched-1', scheduledFor: '2026-07-26T12:00:00.000Z' },
    });
    const createdAt = (await jobStore.getJob('conv-3'))!.createdAt;
    // The claim stamps its outcome BEFORE response persistence; a save failure after
    // it makes `success` a lie the reconciler would faithfully reproduce.
    const claim = await manager.claimTerminalJob('conv-3', 'complete', undefined, createdAt, {
      preserveForReconcile: true,
      scheduleOutcome: { status: 'success' },
    });
    expect(claim).not.toBeNull();
    expect((await jobStore.getJob('conv-3'))?.scheduleOutcome).toBe('success');

    // A stale identity must never restamp a replacement generation.
    await expect(
      manager.updateScheduleOutcome('conv-3', createdAt + 1, { status: 'error', error: 'nope' }),
    ).resolves.toBe(true);
    expect((await jobStore.getJob('conv-3'))?.scheduleOutcome).toBe('success');

    await expect(
      manager.updateScheduleOutcome('conv-3', createdAt, {
        status: 'error',
        error: 'response could not be persisted',
      }),
    ).resolves.toBe(true);
    const job = await jobStore.getJob('conv-3');
    expect(job?.scheduleOutcome).toBe('error');
    expect(job?.scheduleOutcomeError).toBe('response could not be persisted');
    expect(job?.status).toBe('complete');
    expect(job?.completedAt).toBeUndefined();
  });
});

describe('stale-pause recovery retains scheduled evidence', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  const ageBehindLease = async (
    jobStore: Harness['jobStore'],
    streamId: string,
    createdAt: number,
  ) => {
    const { PAUSE_PERSISTENCE_TIMEOUT_MS } = await import('../interfaces/IJobStore');
    await jobStore.updateJob(
      streamId,
      { terminalPersistenceStartedAt: Date.now() - PAUSE_PERSISTENCE_TIMEOUT_MS - 1 },
      createdAt,
    );
  };

  it('in-memory cleanup keeps a scheduled stale pause as retained error evidence', async () => {
    const harness = await makeEvidenceManager();
    const { manager, jobStore } = harness;
    await manager.createJob('conv-5', 'user-1', 'conv-5', {
      initialMetadata: { scheduleId: 'sched-1', scheduledFor: '2026-07-26T12:00:00.000Z' },
    });
    const createdAt = await pauseBehindPersistenceBarrier(harness, 'conv-5', 'act-5');
    await ageBehindLease(jobStore, 'conv-5', createdAt);

    await jobStore.cleanup();

    const job = await jobStore.getJob('conv-5');
    expect(job?.status).toBe('error');
    // The retention signal: WITH completedAt, a Mongo outage longer than the short
    // completed TTL erases this evidence and the run recovers as `interrupted`.
    expect(job?.completedAt).toBeUndefined();
    expect(job?.scheduleOutcome).toBe('error');
  });

  it('in-memory cleanup keeps the ordinary lifecycle for an interactive stale pause', async () => {
    const harness = await makeEvidenceManager();
    const { manager, jobStore } = harness;
    await manager.createJob('conv-6', 'user-1', 'conv-6');
    const createdAt = await pauseBehindPersistenceBarrier(harness, 'conv-6', 'act-6');
    await ageBehindLease(jobStore, 'conv-6', createdAt);

    await jobStore.cleanup();

    const job = await jobStore.getJob('conv-6');
    expect(job == null || typeof job.completedAt === 'number').toBe(true);
    expect(job?.scheduleOutcome).toBeUndefined();
  });

  it('the approval lifecycle keeps a scheduled stale pause as retained error evidence', async () => {
    const harness = await makeEvidenceManager();
    const { manager, jobStore } = harness;
    await manager.createJob('conv-7', 'user-1', 'conv-7', {
      initialMetadata: { scheduleId: 'sched-1', scheduledFor: '2026-07-26T12:00:00.000Z' },
    });
    const createdAt = await pauseBehindPersistenceBarrier(harness, 'conv-7', 'act-7');
    await ageBehindLease(jobStore, 'conv-7', createdAt);

    await expect(manager.approvals.failStalePausePersistence('conv-7', createdAt)).resolves.toBe(
      true,
    );

    const job = await jobStore.getJob('conv-7');
    expect(job?.status).toBe('error');
    expect(job?.completedAt).toBeUndefined();
    expect(job?.scheduleOutcome).toBe('error');
  });
});

describe('legacy job stores without finalization markers', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('is refused at configure time: the runtime contract requires the marker trio', async () => {
    // The trio stays OPTIONAL on the public IJobStore type (source compatibility),
    // but account deletion keys its settlement on the markers, so a store that
    // cannot record them must fail loudly at configure — degrading silently would
    // reopen the terminal-CAS-to-persistence window the markers fence.
    await expect(
      makeEvidenceManager((store) => {
        // Shadow the prototype methods with own undefined properties — `delete`
        // cannot remove class methods from an instance.
        const legacy = store as Record<string, unknown>;
        legacy.registerUserFinalization = undefined;
        legacy.clearUserFinalization = undefined;
        legacy.countUserFinalizations = undefined;
      }),
    ).rejects.toThrow(/registerUserFinalization.*clearUserFinalization.*countUserFinalizations/);
  });
});
