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
): ReturnType<typeof createSchedulesService> {
  const methods = {
    disableUserSchedulesForDeletion: jest.fn(async () => undefined),
    getActiveRunsForUser,
    countActiveRuns: jest.fn(async () => 0),
  };
  const deps = {
    methods,
    getAppConfig: jest.fn(async () => ({})),
    findUserById: jest.fn(async () => null),
    findBalance: jest.fn(async () => null),
    upsertBalance: jest.fn(async () => null),
    resolveAgentFireAccess: jest.fn(async () => 'ok' as const),
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
    await expect(pending).resolves.toBeUndefined();

    // Initial read + at least one poll that observed a non-empty set + the empty one.
    expect(getActive.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stops waiting at the bounded deadline when runs never drain', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([run()]); // never drains
    const service = makeService(getActive);

    const pending = service.quiesceUserSchedules('user-1');
    // Advance past the full bounded timeout; the loop must give up, not hang.
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeUndefined();

    // It polled repeatedly (bounded by the deadline) and surfaced the un-drained runs.
    expect(getActive.mock.calls.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalled();
  });

  it('does not wait when the user has no active runs', async () => {
    jest.useFakeTimers();
    const getActive = jest.fn<Promise<ActiveRun[]>, [string]>().mockResolvedValue([]);
    const service = makeService(getActive);

    await expect(service.quiesceUserSchedules('user-1')).resolves.toBeUndefined();
    // Only the initial collection read; the drain loop is skipped for an empty set.
    expect(getActive).toHaveBeenCalledTimes(1);
  });
});
