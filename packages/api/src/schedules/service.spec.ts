import { logger } from '@librechat/data-schemas';
import type { SchedulesServiceDeps } from './service';
import { createSchedulesService } from './service';

jest.mock('../stream/GenerationJobManager', () => ({
  GenerationJobManager: {
    // No configured job store in the unit harness: abortScheduledJob returns false,
    // so the drain loop is driven purely by getActiveRunsForUser (the run rows).
    getJobStore: () => null,
    abortJob: jest.fn(),
    isRedis: false,
  },
}));

type ActiveRun = { scheduleId: string; scheduledFor: Date; conversationId?: string };

function makeService(
  getActiveRunsForUser: jest.Mock<Promise<ActiveRun[]>, [string]>,
  getAppConfig?: SchedulesServiceDeps['getAppConfig'],
): ReturnType<typeof createSchedulesService> {
  const methods = {
    disableUserSchedulesForDeletion: jest.fn(async () => undefined),
    getActiveRunsForUser,
    countActiveRuns: jest.fn(async () => 0),
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
    // The rows drained, but this harness has no job store so the aborts could not be
    // CONFIRMED delivered — quiesce reports false and the caller must defer destruction.
    await expect(pending).resolves.toBe(false);

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
