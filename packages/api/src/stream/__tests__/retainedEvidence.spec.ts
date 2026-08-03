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

describe('legacy job stores without finalization markers', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('configures, fails registration, and degrades clear/count instead of crashing', async () => {
    // A store written against the pre-marker IJobStore: the trio simply is not there.
    const { manager } = await makeEvidenceManager((store) => {
      // Shadow the prototype methods with own undefined properties — `delete` cannot
      // remove class methods from an instance.
      const legacy = store as Record<string, unknown>;
      legacy.registerUserFinalization = undefined;
      legacy.clearUserFinalization = undefined;
      legacy.countUserFinalizations = undefined;
    });
    await manager.createJob('conv-4', 'user-1', 'conv-4');

    // Registration must FAIL (not silently no-op): callers fall back to running
    // billed post-terminal work synchronously, inside the active-set window, so the
    // deletion guarantee holds without markers.
    await expect(manager.registerUserFinalization('user-1', 'conv-4')).rejects.toThrow(
      'finalization markers',
    );
    // The deletion quiesce calls these directly — a TypeError here aborted the
    // whole deletion pass and the account could never be deleted.
    await expect(manager.countUserFinalizations('user-1')).resolves.toBe(0);
    await expect(manager.clearUserFinalization('user-1', 'conv-4')).resolves.toBeUndefined();
  });
});
