import { logger } from '@librechat/data-schemas';
import type { SchedulesServiceDeps } from './service';
import { createSchedulesService } from './service';

/** Swappable per test: null keeps the no-job-store harness the drain tests rely on. */
let mockJobStore: { getJob: jest.Mock } | null = null;

jest.mock('../stream/GenerationJobManager', () => ({
  GenerationJobManager: {
    // No configured job store by default: abortScheduledJob returns false, so the drain
    // loop is driven purely by getActiveRunsForUser (the run rows).
    getJobStore: () => mockJobStore,
    abortJob: jest.fn(),
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
  return createSchedulesService(deps);
}

const run = (): ActiveRun => ({
  scheduleId: 's1',
  scheduledFor: new Date('2026-01-01T00:00:00.000Z'),
  conversationId: 'c1',
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

describe('admission revision fence', () => {
  const noRuns = () => jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);

  function serviceWithSchedule(schedule: { configRevision?: number } | null) {
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

  it('refuses a schedule that is gone regardless of revision', async () => {
    const service = serviceWithSchedule(null);
    expect(await service.isScheduleLive('sched-1', 3)).toBe(false);
  });

  it('stays permissive when either side has no revision (pre-existing rows)', async () => {
    expect(await serviceWithSchedule({}).isScheduleLive('sched-1', 3)).toBe(true);
    expect(await serviceWithSchedule({ configRevision: 4 }).isScheduleLive('sched-1')).toBe(true);
  });
});
