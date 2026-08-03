import { logger } from '@librechat/data-schemas';
import type { SchedulesServiceDeps } from './service';
import { isShutdownInProgress } from '../app/shutdown';
import { createSchedulesService } from './service';

/** Swappable per test: null keeps the no-job-store harness the drain tests rely on. */
let mockJobStore: { getJob: jest.Mock } | null = null;

jest.mock('../agents/checkpointer', () => ({
  deleteAgentCheckpoint: jest.fn(async () => undefined),
  // Non-empty by default so the scoped prune has something to delete in tests.
  captureAgentCheckpointGeneration: jest.fn(async (threadId: string) => ({
    threadId,
    checkpointIds: ['ck-1'],
  })),
}));
const checkpointerModule = jest.requireMock('../agents/checkpointer') as {
  deleteAgentCheckpoint: jest.Mock;
  captureAgentCheckpointGeneration: jest.Mock;
};

jest.mock('../stream/GenerationJobManager', () => ({
  GenerationJobManager: {
    // No configured job store by default: abortScheduledJob returns false, so the drain
    // loop is driven purely by getActiveRunsForUser (the run rows).
    getJobStore: () => mockJobStore,
    abortJob: jest.fn(),
    resignalAbort: jest.fn(async () => ({ delivered: false, published: true })),
    isRedis: false,
  },
}));

type ActiveRun = {
  scheduleId: string;
  scheduledFor: Date;
  conversationId?: string;
  status?: string;
};

let recordRunOutcome: jest.Mock;

function makeService(
  getActiveRunsForUser: jest.Mock<Promise<ActiveRun[]>, [string]>,
  getAppConfig?: SchedulesServiceDeps['getAppConfig'],
): ReturnType<typeof createSchedulesService> {
  recordRunOutcome = jest.fn(async () => undefined);
  const methods = {
    disableUserSchedulesForDeletion: jest.fn(async () => undefined),
    getActiveRunsForUser,
    countActiveRuns: jest.fn(async () => 0),
    requestRunAbort: jest.fn(async () => true),
    recordRunOutcome,
  };
  const deps = {
    methods,
    getAppConfig: getAppConfig ?? jest.fn(async () => ({})),
    findUserById: jest.fn(async () => null),
    findBalance: jest.fn(async () => null),
    upsertBalance: jest.fn(async () => null),
    resolveAgentFireAccess: jest.fn(async () => 'ok' as const),
    isUserDeleting: jest.fn(async () => false),
  } as unknown as SchedulesServiceDeps;
  // Short bounded waits so fail-closed paths (drains, barriers) resolve in test time.
  return createSchedulesService(deps, {
    drainTimeoutMs: 400,
    drainPollMs: 25,
    stopBarrierTimeoutMs: 400,
    stopBarrierPollMs: 25,
  });
}

const run = (): ActiveRun => ({
  scheduleId: 's1',
  scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
  conversationId: 'c1',
});

describe('shutdown wiring', () => {
  it('carries the coordinator signal on the BASE deps so Run Now is gated too', async () => {
    const service = makeService(jest.fn(async (_userId: string) => []));
    // fireScheduleNow dispatches with engineDeps directly (not the engine's
    // per-pass wrapper), so the shutdown gate must live on the base deps or a
    // manual Run Now POSTs into a closing listener.
    expect(service.engineDeps.isShuttingDown).toBe(isShutdownInProgress);
  });
});

describe('balance initialization', () => {
  const balanceConfig = {
    interfaceConfig: {},
    balance: { enabled: true, startBalance: 20000 },
  } as unknown as Awaited<ReturnType<SchedulesServiceDeps['getAppConfig']>>;

  function serviceWithBalance(existing: Record<string, unknown> | null) {
    const upsertBalance = jest.fn(async () => ({ tokenCredits: 20000 }));
    const service = createSchedulesService({
      methods: {} as unknown as SchedulesServiceDeps['methods'],
      getAppConfig: (async () => balanceConfig) as SchedulesServiceDeps['getAppConfig'],
      findUserById: jest.fn(async () => null),
      findBalance: jest.fn(async () => existing),
      upsertBalance,
      resolveAgentFireAccess: jest.fn(async () => 'ok' as const),
      isUserDeleting: jest.fn(async () => false),
    } as unknown as SchedulesServiceDeps);
    return { service, upsertBalance };
  }

  const updateFrom = (spy: jest.Mock) =>
    (
      spy.mock.calls[0] as unknown as [
        string,
        { set: Record<string, unknown>; setOnInsert: Record<string, unknown> },
      ]
    )[1];

  /**
   * The balance READ and this write are separate statements. A concurrent charge that
   * creates the record in between would be overwritten by a blind `$set`, handing back
   * credits the user had already spent.
   */
  it('initializes the starting credit via setOnInsert, never $set', async () => {
    const { service, upsertBalance } = serviceWithBalance(null);

    await service.engineDeps.isOutOfBalance({ id: 'user-1' } as never);

    expect(upsertBalance).toHaveBeenCalledTimes(1);
    const update = updateFrom(upsertBalance);
    expect(update.setOnInsert).toMatchObject({ tokenCredits: 20000 });
    expect(update.set).not.toHaveProperty('tokenCredits');
  });

  it('still $sets a null credit on an EXISTING record, which has no charge to clobber', async () => {
    const { service, upsertBalance } = serviceWithBalance({ autoRefillEnabled: false });

    await service.engineDeps.isOutOfBalance({ id: 'user-1' } as never);

    const update = updateFrom(upsertBalance);
    expect(update.set).toMatchObject({ tokenCredits: 20000 });
    expect(update.setOnInsert).toEqual({});
  });
});

describe('deleteScheduleForOwner', () => {
  beforeEach(() => {
    // Module-level mock: without this it accumulates calls across tests and the
    // prune assertions below read a previous test's invocation.
    checkpointerModule.deleteAgentCheckpoint.mockClear();
  });

  /**
   * markScheduleDeleting runs FIRST and is one-shot: it matches only a not-yet-deleting
   * row, so a retry answers 404. Anything between it and the aborts that can throw
   * therefore strands the schedule — hidden and fenced, but with its paused job still
   * resumable and its checkpoint unpruned, until the 25-hour abandonment sweep.
   */
  it('still aborts a paused run when the checkpointer config cannot be resolved', async () => {
    const pausedRun = {
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'requires_action',
    };
    const service = makeService(
      jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]),
      // The checkpointer lookup resolves the owner's config; a transient failure here
      // must not cost the abort.
      jest.fn(async () => {
        throw new Error('config plane down');
      }) as unknown as SchedulesServiceDeps['getAppConfig'],
    );
    const methods = service.engineDeps.methods as unknown as {
      markScheduleDeleting: jest.Mock;
      getActiveRunsForSchedule: jest.Mock;
      eraseScheduleIfDrained: jest.Mock;
    };
    methods.markScheduleDeleting = jest.fn(async () => ({ id: 's1', user: 'user-1' }));
    methods.getActiveRunsForSchedule = jest.fn(async () => [pausedRun]);
    methods.eraseScheduleIfDrained = jest.fn(async () => true);
    // The owner must RESOLVE, or the checkpointer lookup short-circuits before it ever
    // reads the config and the throw under test never happens.
    (service.engineDeps as unknown as { getUserContext: jest.Mock }).getUserContext = jest.fn(
      async () => ({ id: 'user-1', tenantId: 't1', role: 'USER' }),
    );

    const abortJob = jest.fn(async () => ({ success: true }));
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'requires_action',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = abortJob;

    // A paused (not running) job is positive evidence: settled synchronously, erased.
    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('deleted');
    expect(abortJob).toHaveBeenCalled();
  });

  /** Shared double set for the drain-discipline tests below. */
  function makeDeleteHarness(run: Partial<ActiveRun> & { scheduleId: string }) {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      markScheduleDeleting: jest.Mock;
      getActiveRunsForSchedule: jest.Mock;
      eraseScheduleIfDrained: jest.Mock;
      recordRunOutcome: jest.Mock;
    };
    methods.markScheduleDeleting = jest.fn(async () => ({ id: run.scheduleId, user: 'user-1' }));
    methods.getActiveRunsForSchedule = jest.fn(async () => [run]);
    methods.eraseScheduleIfDrained = jest.fn(async () => true);
    methods.recordRunOutcome = jest.fn(async () => undefined);
    return { service, methods };
  }

  it('defers settling a pause hand-off still in flight (started row, paused job)', async () => {
    const { service, methods } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'started',
    });
    // The job reports requires_action the instant the run interrupts, while the
    // controller's pause branch is still flushing this segment's writes and records
    // the pause on the row only after them. Settling on the job state alone let the
    // cascade complete before those writes landed.
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'requires_action',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => ({
      success: true,
      signalDelivered: true,
      jobData: { status: 'requires_action' },
    }));

    await service.deleteScheduleForOwner('s1', 'user-1');

    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
  });

  it('does not report success when the abort of a live run is not delivered', async () => {
    const { service, methods } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'started',
    });
    // A RUNNING identity-matched job: not settleable, must be aborted...
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    // ...and the abort delivery FAILS (job store write rejected).
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => {
      throw new Error('store unreachable');
    });

    // The generation may still be producing and billing; claiming success would say
    // it was stopped. The schedule stays hidden and fenced; the delete is idempotent.
    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('unconfirmed');
    expect(methods.eraseScheduleIfDrained).not.toHaveBeenCalled();
  });

  it('treats an unreadable job store as unknown, not absent', async () => {
    const { service, methods } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'started',
    });
    mockJobStore = {
      getJob: jest.fn(async () => {
        throw new Error('redis gone');
      }),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => {
      throw new Error('redis gone');
    });

    // With the store unreadable NOTHING is proven: the row must not be settled as
    // an orphan (its generation may be live) and the delete must not read as done.
    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('unconfirmed');
    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
  });

  it('settles a provably job-less run synchronously and erases without a reconciler', async () => {
    const { service, methods } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'started',
    });
    // Confirmed absence: the lookup SUCCEEDS and returns null (a crashed fire, or a
    // stale row from a previous topology). The clustered entrypoint has no reconciler,
    // so deferring this row to one retained the deleted schedule indefinitely there.
    mockJobStore = { getJob: jest.fn(async () => null) } as unknown as typeof mockJobStore;

    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('deleted');
    expect(methods.recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 's1', status: 'interrupted' }),
    );
    expect(methods.eraseScheduleIfDrained).toHaveBeenCalledWith('s1');
  });

  /**
   * The durable checkpoint is keyed by conversationId ALONE, so pruning it when a
   * REPLACEMENT turn owns the conversation strips the resume state of a live generation
   * that has nothing to do with this schedule — the same hazard the interactive abort
   * route refuses with a 409.
   */
  it('does not prune the checkpoint when a replacement owns the conversation', async () => {
    const { service } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'requires_action',
    });
    // A job IS present, but it carries a DIFFERENT occurrence's identity: this
    // conversation now belongs to someone else's turn.
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        createdAt: 99,
        scheduleId: 'a-different-schedule',
        scheduledFor: new Date('2030-01-01T00:00:00.000Z').toISOString(),
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => ({ success: true }));

    await service.deleteScheduleForOwner('s1', 'user-1');

    expect(checkpointerModule.deleteAgentCheckpoint).not.toHaveBeenCalled();
  });

  it('prunes the checkpoint of a paused run it does own', async () => {
    const { service } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'requires_action',
    });
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'requires_action',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => ({ success: true }));

    await service.deleteScheduleForOwner('s1', 'user-1');

    // SCOPED to the checkpoint ids captured before the terminal transition, so a
    // replacement's later checkpoints can never be swept up by this prune.
    expect(checkpointerModule.deleteAgentCheckpoint).toHaveBeenCalledWith('c1', undefined, {
      threadId: 'c1',
      checkpointIds: ['ck-1'],
    });
  });

  it('reports draining when a live run was aborted but has not yet settled', async () => {
    const { service, methods } = makeDeleteHarness({
      scheduleId: 's1',
      scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
      conversationId: 'c1',
      status: 'started',
    });
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => ({ success: true }));
    // The run row is still active, so the erase declines; settlement (and the
    // erase-on-settle it triggers) belongs to the aborted generation's outcome write.
    methods.eraseScheduleIfDrained = jest.fn(async () => false);

    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('draining');
  });

  afterEach(() => {
    mockJobStore = null;
    jest.restoreAllMocks();
  });
});

describe('erase-on-settle', () => {
  /**
   * Whichever process records a run's terminal outcome also attempts the deferred
   * erase of a deleting schedule. This is what makes a delete's `draining` state
   * converge in EVERY topology — the clustered entrypoint runs no reconciler, so
   * without it the hidden schedule (and its prompt, which has no TTL) survived its
   * last run indefinitely there.
   */
  it('attempts the deferred erase after recording a terminal outcome', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      getScheduleById: jest.Mock;
      recordRunOutcome: jest.Mock;
      eraseScheduleIfDrained: jest.Mock;
    };
    methods.getScheduleById = jest.fn(async () => null);
    methods.recordRunOutcome = jest.fn(async () => undefined);
    methods.eraseScheduleIfDrained = jest.fn(async () => true);

    await expect(
      service.recordScheduleOutcome({
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
        status: 'success',
      }),
    ).resolves.toBe(true);
    expect(methods.eraseScheduleIfDrained).toHaveBeenCalledWith('s1');
  });

  it('does not erase on a pause, which is not a settlement', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      getScheduleById: jest.Mock;
      recordRunOutcome: jest.Mock;
      eraseScheduleIfDrained: jest.Mock;
    };
    methods.getScheduleById = jest.fn(async () => null);
    methods.recordRunOutcome = jest.fn(async () => undefined);
    methods.eraseScheduleIfDrained = jest.fn(async () => true);

    await service.recordScheduleOutcome({
      scheduleId: 's1',
      scheduledFor: '2026-01-01T00:00:00.000Z',
      status: 'requires_action',
    });
    expect(methods.eraseScheduleIfDrained).not.toHaveBeenCalled();
  });
});

describe('attachment hold renewal', () => {
  it('renews the bounded upload hold at fire preflight, best-effort', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      extendFilesTTL: jest.Mock;
      getFiles: jest.Mock;
    };
    // The hold bridges upload -> first consumption; a renewal failure must not fail
    // the fire (the file resolves now; at worst the hold lapses later).
    methods.extendFilesTTL = jest.fn(async () => {
      throw new Error('mongo down');
    });
    methods.getFiles = jest.fn(async () => [
      { file_id: 'f1', filepath: '/f1', filename: 'a.png', type: 'image/png', source: 'local' },
    ]);

    const files = await service.engineDeps.resolveFiles(['f1'], { id: 'user-1', tenantId: 't1' });
    expect(methods.extendFilesTTL).toHaveBeenCalledWith(
      ['f1'],
      expect.objectContaining({ renewMs: expect.any(Number), maxLifetimeMs: expect.any(Number) }),
      { user: 'user-1', tenantId: 't1' },
    );
    expect(files).toHaveLength(1);
  });
});

describe('isScheduleLive policy recheck', () => {
  const liveRow = { id: 's1', user: 'u1', enabled: true } as never;

  it('refuses a resume while the operator kill switch is up', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as { getScheduleById: jest.Mock };
    methods.getScheduleById = jest.fn(async () => liveRow);
    process.env.SCHEDULES_DISABLED = 'true';
    try {
      // The row-level checks alone pass; only the policy recheck sees the switch.
      await expect(service.isScheduleLive('s1')).resolves.toBe(true);
      // A pause can sit for hours; an approval must not start a billed continuation
      // the operator believes is stopped.
      await expect(service.isScheduleLive('s1', undefined, { policy: true })).resolves.toBe(false);
    } finally {
      delete process.env.SCHEDULES_DISABLED;
    }
  });

  it('refuses a resume when the owner lost SCHEDULES:USE', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      getScheduleById: jest.Mock;
      getRoleByName: jest.Mock;
    };
    methods.getScheduleById = jest.fn(async () => liveRow);
    methods.getRoleByName = jest.fn(async () => ({ permissions: { SCHEDULES: { USE: false } } }));
    (service.engineDeps as unknown as { getUserContext: jest.Mock }).getUserContext = jest.fn(
      async () => ({ id: 'u1', tenantId: 't1', role: 'USER' }),
    );

    await expect(service.isScheduleLive('s1', undefined, { policy: true })).resolves.toBe(false);
  });
});

describe('quiesceUserSchedules drain wait', () => {
  afterEach(() => {
    mockJobStore = null;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('polls the active runs until they drain, then returns', async () => {
    jest.useFakeTimers();
    const active = [run()];
    const getActive = jest
      .fn<Promise<ActiveRun[]>, [string]>()
      .mockResolvedValueOnce(active) // initial collection for abort
      .mockResolvedValueOnce(active) // first poll: still settling
      .mockResolvedValue([]); // subsequent polls: drained
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    // Each poll waits one interval; advance twice so the loop observes the drain.
    await jest.advanceTimersByTimeAsync(250);
    await jest.advanceTimersByTimeAsync(250);
    // The rows DRAINED, so the runs are genuinely settled even though this harness has
    // no job store and the aborts could not be confirmed delivered. The drain is the
    // authority; an undelivered abort whose run then settled must not defer deletion
    // forever.
    await expect(pending).resolves.toBe(true);

    // Initial read + at least one poll that observed a non-empty set + the empty one.
    expect(getActive.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stops waiting at the bounded deadline when runs never drain', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([run()]); // never drains
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    // Advance past the full bounded timeout; the loop must give up, not hang, and must
    // report the drain as UNCONFIRMED so deletion defers rather than destroying.
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBe(false);

    // It polled repeatedly (bounded by the deadline) and surfaced the un-drained runs.
    expect(getActive.mock.calls.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalled();
  });

  /**
   * A `started` row whose job is already terminal is the preserve-for-reconcile case:
   * the inline outcome write exhausted its retries, so the retained job is the ONLY
   * evidence the run finished. Account deletion deletes that job (nothing will ever
   * reconcile it once the rows are hard-deleted), so it has to project the job's
   * terminal state onto the row first — otherwise the row stays active, the bounded
   * drain can never confirm, and deletion defers until the 30-minute orphan cutoff.
   */
  it('does not settle a pause hand-off still in flight (started row, paused job)', async () => {
    jest.useFakeTimers();
    const started = { ...run(), status: 'started' };
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([started]);
    const service = makeService(getActive);
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'requires_action',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      })),
    } as unknown as typeof mockJobStore;

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(10_000);
    // The pause hand-off's writes are still in flight; confirming the drain here
    // let the destructive cascade run before they landed. Deferral is bounded: the
    // controller (or the paused-window reconciler) flips the row to requires_action
    // and the pending-deletion sweep retries.
    await expect(pending).resolves.toBe(false);

    expect(recordRunOutcome).not.toHaveBeenCalled();
  });

  it('settles a started run from its retained terminal job before dropping the evidence', async () => {
    jest.useFakeTimers();
    const started = { ...run(), status: 'started' };
    const getActive = jest
      .fn<Promise<ActiveRun[]>, [string]>()
      .mockResolvedValueOnce([started])
      .mockResolvedValue([]);
    const service = makeService(getActive);
    // deleteJob MUST be present: without it the store call throws, the delete never
    // happens, and this test would pass while proving nothing about the ordering.
    const deleteJob = jest.fn(async () => undefined);
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'complete',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      })),
      deleteJob,
    } as unknown as typeof mockJobStore;

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe(true);

    expect(recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 's1', status: 'success' }),
    );
    // The retained job is the ONLY evidence this run finished, so it may not be deleted
    // until the outcome is durably recorded.
    expect(deleteJob).toHaveBeenCalled();
    expect(recordRunOutcome.mock.invocationCallOrder[0]).toBeLessThan(
      deleteJob.mock.invocationCallOrder[0],
    );
  });

  /**
   * `aborted` is the abort REQUEST landing, not the generation finishing: abortJob wins
   * its status CAS before the owner unwinds, and both owner paths settle LAST, after
   * saveMessage. Settling on that evidence confirms the drain while the partial write is
   * still in flight — account deletion then destroys the user's data and the owner
   * writes a message back for the account that no longer exists.
   */
  it('does not settle a run whose abort is still in flight', async () => {
    jest.useFakeTimers();
    const aborting = {
      ...run(),
      status: 'started',
      abortRequestedAt: new Date(Date.now() - 1000),
    };
    const service = makeService(
      jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([aborting]),
    );
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'aborted',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      })),
      deleteJob: jest.fn(async () => undefined),
    } as unknown as typeof mockJobStore;

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(10_000);
    // Unconfirmed, so the caller defers deletion (503 + Retry-After) instead of
    // destroying data the owner is still writing.
    await expect(pending).resolves.toBe(false);
    expect(recordRunOutcome).not.toHaveBeenCalled();
  });

  /**
   * The other direction: an abort whose owner never came back is presumed dead past the
   * grace, or the account could never be deleted at all.
   */
  it('settles a run whose abort request has outlived the owner grace', async () => {
    jest.useFakeTimers();
    const abandoned = {
      ...run(),
      status: 'started',
      abortRequestedAt: new Date(Date.now() - 45 * 60 * 1000),
    };
    const getActive = jest
      .fn<Promise<ActiveRun[]>, [string]>()
      .mockResolvedValueOnce([abandoned])
      .mockResolvedValue([]);
    const service = makeService(getActive);
    mockJobStore = {
      getJob: jest.fn(async () => null),
      deleteJob: jest.fn(async () => undefined),
    } as unknown as typeof mockJobStore;

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBe(true);
    expect(recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 's1', status: 'interrupted' }),
    );
  });

  it('keeps the retained job when settling it fails', async () => {
    jest.useFakeTimers();
    const started = { ...run(), status: 'started' };
    const service = makeService(
      jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([started]),
    );
    const deleteJob = jest.fn(async () => undefined);
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'complete',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      })),
      deleteJob,
    } as unknown as typeof mockJobStore;
    recordRunOutcome.mockRejectedValue(new Error('mongo down'));

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(11_000);
    // The row never settles, so the drain cannot confirm and deletion defers.
    await expect(pending).resolves.toBe(false);

    // Evidence intact for the next pass.
    expect(deleteJob).not.toHaveBeenCalled();
  });

  it('does not wait when the user has no active runs', async () => {
    jest.useFakeTimers();
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);
    const service = makeService(getActive);

    // Nothing to abort and nothing to drain, so the quiesce is trivially CONFIRMED and
    // the deletion cascade may proceed to its destructive steps.
    await expect(service.quiesceUserSchedules('user-1')).resolves.toBe(true);
    // Only the initial collection read; the drain loop is skipped for an empty set.
    expect(getActive).toHaveBeenCalledTimes(1);
  });

  /** A `requires_action` row whose HITL approval was resumed through the chat UI. */
  const pausedRun = (): ActiveRun => ({ ...run(), status: 'requires_action' });

  it('does not terminalize a paused row whose resumed generation is still running', async () => {
    jest.useFakeTimers();
    // The resume promotes only the JOB to `running`; the row stays `requires_action`.
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
        createdAt: 1,
      })),
    };
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([pausedRun()]);
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(10_000);
    // Terminalizing here would drop the row out of the active set, so the drain would
    // report nothing to wait for and the destructive cascade could delete messages the
    // resumed generation is still able to persist.
    await expect(pending).resolves.toBe(false);
    expect(recordRunOutcome).not.toHaveBeenCalled();
  });

  it('still terminalizes a genuinely paused row so deletion is not blocked forever', async () => {
    jest.useFakeTimers();
    // Paused for approval, no live generation behind it.
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'requires_action',
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
        createdAt: 1,
      })),
    };
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([pausedRun()]);
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(10_000);
    await pending;
    // An approval that will never be consumed must not keep the account undeletable.
    expect(recordRunOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: 's1', status: 'interrupted' }),
    );
  });

  it('does not terminalize a paused row when the job lookup FAILS', async () => {
    jest.useFakeTimers();
    mockJobStore = {
      getJob: jest.fn(async () => {
        throw new Error('redis unavailable');
      }),
    };
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([pausedRun()]);
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(10_000);
    // A thrown lookup is evidence of NOTHING. Reading it as "genuinely paused" would
    // terminalize a row whose resumed generation may still be running, and the drain
    // would then permit the destructive cascade.
    await expect(pending).resolves.toBe(false);
    expect(recordRunOutcome).not.toHaveBeenCalled();
  });

  it('terminalizes a paused row when a replacement turn took over the conversation', async () => {
    jest.useFakeTimers();
    // A replacement user turn reuses the conversationId but strips the scheduled
    // identity, so this running job is NOT this occurrence's generation.
    mockJobStore = {
      getJob: jest.fn(async () => ({ status: 'running', createdAt: 1 })),
    };
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([pausedRun()]);
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    await jest.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(recordRunOutcome).toHaveBeenCalled();
  });
});

describe('global kill switch', () => {
  const noRuns = () => jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);

  afterEach(() => {
    delete process.env.SCHEDULES_DISABLED;
  });

  it('is off by default', async () => {
    const service = makeService(noRuns());
    expect(await service.engineDeps.isGloballyDisabled()).toBe(false);
  });

  it('trips on the SCHEDULES_DISABLED env lever without reading config', async () => {
    process.env.SCHEDULES_DISABLED = 'true';
    // Throwing getAppConfig proves the env lever works even when the config plane is
    // unhealthy — the case where a config-dependent kill switch would fail.
    const getAppConfig = jest.fn(async () => {
      throw new Error('config plane down');
    }) as unknown as SchedulesServiceDeps['getAppConfig'];
    const service = makeService(noRuns(), getAppConfig);
    expect(await service.engineDeps.isGloballyDisabled()).toBe(true);
    expect(getAppConfig).not.toHaveBeenCalled();
  });

  it('trips on `interface.schedules: false` read from the BASE config only', async () => {
    const getAppConfig = jest.fn(async (options?: { baseOnly?: boolean }) =>
      options?.baseOnly === true
        ? { interfaceConfig: { schedules: false } }
        : // A principal-merged view that re-enables must NOT be consulted: the global
          // stop is base-only so no role/user/tenant override can widen past it.
          { interfaceConfig: { schedules: true } },
    ) as unknown as SchedulesServiceDeps['getAppConfig'];
    const service = makeService(noRuns(), getAppConfig);
    expect(await service.engineDeps.isGloballyDisabled()).toBe(true);
    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('does not trip when only a principal-merged config disables it', async () => {
    // Per-principal availability is NOT the global stop; the engine keeps claiming so
    // other principals still fire, and the fire path skips this owner's occurrences.
    const getAppConfig = jest.fn(async (options?: { baseOnly?: boolean }) =>
      options?.baseOnly === true
        ? { interfaceConfig: { schedules: true } }
        : { interfaceConfig: { schedules: false } },
    ) as unknown as SchedulesServiceDeps['getAppConfig'];
    const service = makeService(noRuns(), getAppConfig);
    expect(await service.engineDeps.isGloballyDisabled()).toBe(false);
  });

  it('trips on the object form `{ use: false }` exactly like the boolean stop', async () => {
    // Both stop shapes must FREEZE occurrences (engine stops claiming, nothing
    // advances). A shape-blind gate left the engine claiming while getLimits refused
    // fires, so the disabled path ADVANCED each occurrence — a short maintenance stop
    // silently dropped everything it covered instead of leaving it due.
    const getAppConfig = jest.fn(async () => ({
      interfaceConfig: { schedules: { use: false, maxPerUser: 5 } },
    })) as unknown as SchedulesServiceDeps['getAppConfig'];
    const service = makeService(noRuns(), getAppConfig);
    expect(await service.engineDeps.isGloballyDisabled()).toBe(true);
  });

  it('does not trip on the object form while `use` stays enabled', async () => {
    const getAppConfig = jest.fn(async () => ({
      interfaceConfig: { schedules: { use: true, maxPerUser: 5 } },
    })) as unknown as SchedulesServiceDeps['getAppConfig'];
    const service = makeService(noRuns(), getAppConfig);
    expect(await service.engineDeps.isGloballyDisabled()).toBe(false);
  });
});

describe('deployment-wide limits', () => {
  const noRuns = () => jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);

  it('resolves a principal-less getLimits from the BASE config only', async () => {
    const getAppConfig = jest.fn(async (options?: { baseOnly?: boolean }) =>
      options?.baseOnly === true
        ? { interfaceConfig: { schedules: { use: true, fireConcurrency: 1 } } }
        : // The principal/tenant-merged view. A bare getAppConfig() resolves THIS,
          // including whatever tenant the ALS context happens to carry.
          { interfaceConfig: { schedules: { use: true, fireConcurrency: 5 } } },
    ) as unknown as SchedulesServiceDeps['getAppConfig'];
    const service = makeService(noRuns(), getAppConfig);
    const limits = await service.getLimits();
    // NO principal must mean the DEPLOYMENT's config. Both callers of this form run
    // inside a tenant context (fireSchedule clamps the global capacity allocator from
    // within runInTenantContext(owner); the engine tick budgets from within
    // runAsSystem), so resolving the merged view would let a tenant override widen the
    // very global cap it is clamped against.
    expect(limits.fireConcurrency).toBe(1);
    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });
});

describe('loopback self URL', () => {
  const noRuns = () => jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);
  const address = { address: '::1', family: 'IPv6' as const, port: 4123 };

  afterEach(() => {
    delete process.env.SCHEDULES_SELF_URL;
  });

  it('targets the address the server actually bound', async () => {
    const service = makeService(noRuns());
    // Resolved even though arming fails here (unsafe topology): the fire path is
    // reachable via Run Now independently of whether the engine tick armed.
    await service.initializeScheduleEngine({ address });
    expect(service.engineDeps.getSelfUrl()).toBe('http://[::1]:4123');
  });

  it('still lets an operator override with SCHEDULES_SELF_URL', async () => {
    process.env.SCHEDULES_SELF_URL = 'http://proxy.internal:9000';
    const service = makeService(noRuns());
    await service.initializeScheduleEngine({ address });
    expect(service.engineDeps.getSelfUrl()).toBe('http://proxy.internal:9000');
  });
});

describe('admission revision fence', () => {
  const noRuns = () => jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);

  function serviceWithSchedule(schedule: { configRevision?: number; enabled?: boolean } | null) {
    const service = makeService(noRuns());
    (
      service.engineDeps.methods as unknown as {
        getScheduleById: jest.Mock;
      }
    ).getScheduleById = jest.fn(async () => schedule);
    return service;
  }

  it('admits when the claimed revision still matches', async () => {
    const service = serviceWithSchedule({ configRevision: 3 });
    expect(await service.isScheduleLive('sched-1', 3)).toBe(true);
  });

  it('REFUSES when an owner edit moved the revision on after the claim', async () => {
    // The fire was claimed under revision 3; the owner edited since (now 4). Persisting
    // would write the OLD prompt/agent into the edited schedule's history.
    const service = serviceWithSchedule({ configRevision: 4 });
    expect(await service.isScheduleLive('sched-1', 3)).toBe(false);
  });

  /**
   * A policy auto-disable flips `enabled` WITHOUT touching configRevision (an older
   * paused occurrence can resume, fail and cross the threshold while a newer occurrence
   * is already in the claim-to-controller window), so the revision fence cannot see it.
   */
  it('refuses an AUTOMATIC fire once the schedule was disabled', async () => {
    const service = serviceWithSchedule({ configRevision: 3, enabled: false });
    expect(await service.isScheduleLive('sched-1', 3, { automatic: true })).toBe(false);
  });

  it('still admits Run Now on a disabled schedule', async () => {
    // An explicit user action, matching fireScheduleNow's own relaxation.
    const service = serviceWithSchedule({ configRevision: 3, enabled: false });
    expect(await service.isScheduleLive('sched-1', 3, { automatic: false })).toBe(true);
    expect(await service.isScheduleLive('sched-1', 3)).toBe(true);
  });

  it('admits an automatic fire while the schedule is still enabled', async () => {
    const service = serviceWithSchedule({ configRevision: 3, enabled: true });
    expect(await service.isScheduleLive('sched-1', 3, { automatic: true })).toBe(true);
  });

  it('refuses a schedule that is gone regardless of revision', async () => {
    const service = serviceWithSchedule(null);
    expect(await service.isScheduleLive('sched-1', 3)).toBe(false);
  });

  it('stays permissive when either side has no revision (pre-existing rows)', async () => {
    expect(await serviceWithSchedule({}).isScheduleLive('sched-1', 3)).toBe(true);
    expect(await serviceWithSchedule({ configRevision: 4 }).isScheduleLive('sched-1')).toBe(true);
  });
});

describe('abort stamp is load-bearing (withheld abort on stamp failure)', () => {
  it('withholds the abort and reports unconfirmed when the stamp cannot be made durable', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      markScheduleDeleting: jest.Mock;
      getActiveRunsForSchedule: jest.Mock;
      eraseScheduleIfDrained: jest.Mock;
      requestRunAbort: jest.Mock;
    };
    methods.markScheduleDeleting = jest.fn(async () => ({ id: 's1', user: 'user-1' }));
    methods.getActiveRunsForSchedule = jest.fn(async () => [
      {
        scheduleId: 's1',
        scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
        conversationId: 'c1',
        status: 'started',
      },
    ]);
    methods.eraseScheduleIfDrained = jest.fn(async () => true);
    // The stamp is what makes concurrent drains and the reconciler defer to the
    // owner's settle; signalling an abort without it re-opens the drain-mid-write
    // window the stamp exists to close.
    methods.requestRunAbort = jest.fn(async () => {
      throw new Error('mongo down');
    });
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.abortJob = jest.fn(async () => ({ success: true }));

    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('unconfirmed');
    expect(manager.abortJob).not.toHaveBeenCalled();
  });

  it('reports an abort whose cross-replica publish failed as not delivered', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    // The terminal CAS landed but the peer replica never received the signal: the
    // generation may still be producing, so delivery must read false.
    manager.abortJob = jest.fn(async () => ({ success: true, signalDelivered: false }));

    const delivered = await service.engineDeps.abortScheduledJob(
      'c1',
      { scheduleId: 's1', scheduledFor: '2026-01-01T00:00:00.000Z' },
      { preserve: true },
    );
    expect(delivered).toBe(false);
  });
});

describe('awaitStopAbortPersistence (generation-owner settlement barrier)', () => {
  const scheduledFor = new Date('2026-01-01T00:00:00.000Z');

  function serviceWithAbortState(states: Array<Record<string, unknown> | null>) {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      getScheduleRunAbortState: jest.Mock;
    };
    const reads = jest.fn(async () => (states.length > 1 ? states.shift() : states[0]));
    methods.getScheduleRunAbortState = reads;
    return { service, reads };
  }

  it('returns immediately when no abort is stamped', async () => {
    const { service, reads } = serviceWithAbortState([
      { status: 'started', abortRequestedAt: undefined },
    ]);
    await service.awaitStopAbortPersistence('s1', scheduledFor);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('returns immediately for a deletion-sourced abort (nothing persists after it)', async () => {
    const { service, reads } = serviceWithAbortState([
      { status: 'started', abortRequestedAt: new Date(), abortSource: 'deletion' },
    ]);
    await service.awaitStopAbortPersistence('s1', scheduledFor);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('waits for a fresh stop abort until the route stamps its persistence', async () => {
    const pending = {
      status: 'started',
      abortRequestedAt: new Date(),
      abortSource: 'stop',
      abortPersistedAt: undefined,
    };
    const persisted = { ...pending, abortPersistedAt: new Date() };
    const { service, reads } = serviceWithAbortState([pending, pending, persisted]);
    await service.awaitStopAbortPersistence('s1', scheduledFor);
    // Two pending reads, then the stamp releases the barrier.
    expect(reads.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('fails CLOSED on an unreadable run row', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      getScheduleRunAbortState: jest.Mock;
    };
    methods.getScheduleRunAbortState = jest.fn(async () => {
      throw new Error('mongo down');
    });
    // An unreadable row proves nothing about the route's writes — releasing the
    // barrier here was the original fail-open bug with extra steps.
    await expect(service.awaitStopAbortPersistence('s1', scheduledFor)).resolves.toBe(false);
  });

  it('fails CLOSED when the route never resolves its persistence in time', async () => {
    const { service } = serviceWithAbortState([
      {
        status: 'started',
        abortRequestedAt: new Date(),
        abortSource: 'stop',
        abortPersistedAt: undefined,
      },
    ]);
    // The caller must NOT settle on false: the run stays active for the reconciler,
    // which finalizes it once the owner-death fence lapses.
    await expect(service.awaitStopAbortPersistence('s1', scheduledFor)).resolves.toBe(false);
  });
});

describe('deleteScheduleForOwner waits for the settle acknowledgement', () => {
  it('converges when an unconfirmed abort settles during the bounded drain', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as {
      markScheduleDeleting: jest.Mock;
      getActiveRunsForSchedule: jest.Mock;
      eraseScheduleIfDrained: jest.Mock;
    };
    methods.markScheduleDeleting = jest.fn(async () => ({ id: 's1', user: 'user-1' }));
    // Active at the abort pass, drained by the first drain poll: the owner settled.
    methods.getActiveRunsForSchedule = jest
      .fn()
      .mockResolvedValueOnce([
        {
          scheduleId: 's1',
          scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
          conversationId: 'c1',
          status: 'started',
        },
      ])
      .mockResolvedValue([]);
    methods.eraseScheduleIfDrained = jest.fn(async () => true);
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'running',
        createdAt: 1,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    // Delivery cannot be locally proven (peer-owned generation): honest false...
    manager.abortJob = jest.fn(async () => ({ success: true, signalDelivered: false }));

    // ...but the run row leaving the active set is the durable acknowledgement, so
    // the delete converges instead of answering a spurious 503.
    await expect(service.deleteScheduleForOwner('s1', 'user-1')).resolves.toBe('deleted');
  });
});

describe('abort retries re-signal instead of trusting terminal status', () => {
  it('re-publishes the abort for an already-aborted job and reports honest delivery', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'aborted',
        createdAt: 7,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.resignalAbort = jest.fn(async () => ({ delivered: false, published: true }));

    // The first abort flipped the job before its publication; a retry that trusts
    // the terminal status returns "delivered" without republishing, and a failed
    // publish then never redelivers. The retry must re-signal.
    const delivered = await service.engineDeps.abortScheduledJob(
      'c1',
      { scheduleId: 's1', scheduledFor: '2026-01-01T00:00:00.000Z' },
      { preserve: true },
    );
    expect(manager.resignalAbort).toHaveBeenCalledWith('c1', 7);
    expect(delivered).toBe(false);
  });

  it('keeps the evidence when an undelivered re-signal would otherwise be deleted', async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const deleteJob = jest.fn(async () => true);
    mockJobStore = {
      getJob: jest.fn(async () => ({
        status: 'aborted',
        createdAt: 7,
        scheduleId: 's1',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })),
      deleteJob,
    } as unknown as typeof mockJobStore;
    const manager = jest.requireMock('../stream/GenerationJobManager').GenerationJobManager;
    manager.resignalAbort = jest.fn(async () => ({ delivered: false, published: true }));

    const delivered = await service.engineDeps.abortScheduledJob(
      'c1',
      { scheduleId: 's1', scheduledFor: '2026-01-01T00:00:00.000Z' },
      { preserve: false },
    );
    expect(delivered).toBe(false);
    // Undelivered means the peer generation may still be live; the retained job is
    // the only evidence a later pass can re-signal from.
    expect(deleteJob).not.toHaveBeenCalled();
  });
});

describe('requestScheduledRunAbort maps stamp serialization', () => {
  it("returns 'in_progress' when another stop attempt holds the stamp", async () => {
    const service = makeService(jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]));
    const methods = service.engineDeps.methods as unknown as { requestRunAbort: jest.Mock };
    methods.requestRunAbort = jest.fn(async () => 'in_progress');
    await expect(
      service.requestScheduledRunAbort('s1', new Date('2026-01-01T00:00:00.000Z')),
    ).resolves.toBe('in_progress');
  });
});
