import type { SchedulesServiceDeps } from './service';
import { createSchedulesService } from './service';

jest.mock('../stream/GenerationJobManager', () => ({
  GenerationJobManager: { getJobStore: () => null, abortJob: jest.fn(), isRedis: false },
}));

type Cfg = { interfaceConfig?: { schedules?: unknown } };

function makeService(base: Cfg, merged: Cfg = base) {
  const deps = {
    methods: {
      countActiveRuns: jest.fn(async () => 0),
      getCapacityOccupancy: jest.fn(async () => ({ takenSlots: [], unslotted: 0 })),
      ensureScheduleIndexes: jest.fn(async () => undefined),
      acquireManualRunLease: jest.fn(async () => null),
    },
    getAppConfig: jest.fn(async (options?: { baseOnly?: boolean }) =>
      options?.baseOnly === true ? base : merged,
    ),
    findUserById: jest.fn(async () => null),
    findBalance: jest.fn(async () => null),
    upsertBalance: jest.fn(async () => null),
    resolveAgentFireAccess: jest.fn(async () => 'ok' as const),
    isUserDeleting: jest.fn(async () => false),
  } as unknown as SchedulesServiceDeps;
  return createSchedulesService(deps);
}

const schedule = { id: 's1', user: 'u1' } as never;
const limits = {
  enabled: true,
  maxPerUser: 10,
  minIntervalMinutes: 60,
  autoDisableAfterFailures: 5,
  fireConcurrency: 5,
};

describe('v1 experimental gate, asserted at real entry points', () => {
  afterEach(() => {
    delete process.env.SCHEDULES_DISABLED;
  });

  it('is OFF when the admin never opted in, and does not arm the engine', async () => {
    const service = makeService({});
    expect((await service.getLimits()).enabled).toBe(false);
    // The engine must not merely refuse to fire — it must not start at all.
    expect(await service.initializeScheduleEngine()).toBeUndefined();
  });

  it('stays OFF for an explicit false', async () => {
    expect((await makeService({ interfaceConfig: { schedules: false } }).getLimits()).enabled).toBe(
      false,
    );
  });

  it('turns ON for an explicit opt-in', async () => {
    expect((await makeService({ interfaceConfig: { schedules: true } }).getLimits()).enabled).toBe(
      true,
    );
    const tuned = makeService({ interfaceConfig: { schedules: { maxPerUser: 3 } } });
    const resolved = await tuned.getLimits();
    expect(resolved.enabled).toBe(true);
    expect(resolved.maxPerUser).toBe(3);
  });

  it('REFUSES a manual run-now while the global kill switch is on', async () => {
    // Run Now dispatches the same billed generation as an automatic fire, so gating only
    // the engine tick would leave this path open.
    process.env.SCHEDULES_DISABLED = 'true';
    const service = makeService({ interfaceConfig: { schedules: true } });
    const result = await service.fireScheduleNow(schedule, limits);
    expect(result).toEqual({ fired: false, skipped: 'disabled' });
  });

  it('refuses run-now when the BASE config disables it, even if a principal re-enables', async () => {
    const service = makeService(
      { interfaceConfig: { schedules: false } },
      { interfaceConfig: { schedules: true } },
    );
    const result = await service.fireScheduleNow(schedule, limits);
    expect(result).toEqual({ fired: false, skipped: 'disabled' });
  });

  it('constructing the service without a required dep fails LOUDLY at boot', () => {
    // The JS adapter is not typechecked against SchedulesServiceDeps, which is how the
    // deletion-barrier probe shipped unwired twice. A missing dep must not surface as a
    // cryptic per-fire "is not a function".
    expect(() =>
      createSchedulesService({
        methods: {},
        getAppConfig: jest.fn(),
        findUserById: jest.fn(),
        findBalance: jest.fn(),
        upsertBalance: jest.fn(),
        resolveAgentFireAccess: jest.fn(),
      } as unknown as SchedulesServiceDeps),
    ).toThrow(/isUserDeleting/);
  });
});
