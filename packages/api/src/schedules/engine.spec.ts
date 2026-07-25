import type { ScheduleEngineDeps, ScheduleLimits, ScheduleUserContext } from './types';
import type { FireableSchedule } from './types';
import { startScheduleEngine } from './engine';

const LEASE_MS = 5 * 60_000;
const OWNER: ScheduleUserContext = { id: 'user-1', tenantId: 't1', role: 'USER' };
const LIMITS: ScheduleLimits = {
  enabled: true,
  maxPerUser: 10,
  minIntervalMinutes: 60,
  autoDisableAfterFailures: 5,
  fireConcurrency: 5,
};

/**
 * A schedule due 60s ago whose lease was just taken, so the tick reads it as due
 * rather than misfired (`dbNow` is derived from `leaseUntil - LEASE_MS`).
 */
function makeClaimedSchedule(overrides: Partial<FireableSchedule> = {}): FireableSchedule {
  const now = Date.now();
  return {
    id: 'sched-1',
    user: 'user-1' as never,
    tenantId: 't1',
    name: 'Digest',
    prompt: 'Summarize',
    agent_id: 'agent-1',
    cadence: { frequency: 'daily', hour: 8, minute: 0 },
    timezone: 'America/New_York',
    target: 'new',
    enabled: true,
    claimToken: 'ct-1',
    leaseBy: 'inst-1',
    nextRunAt: new Date(now - 60_000),
    leaseUntil: new Date(now + LEASE_MS),
    runCount: 0,
    failureCount: 0,
    balanceSkipCount: 0,
    ...overrides,
  } as FireableSchedule;
}

function makeMethods(schedule: FireableSchedule) {
  let claims = 0;
  return {
    // One claimable occurrence per tick, then the claim scan comes up empty.
    claimDueSchedule: jest.fn(async () => (claims++ === 0 ? schedule : null)),
    countActiveRuns: jest.fn(async () => 0),
    advanceSchedule: jest.fn(async () => undefined),
    disableSchedule: jest.fn(async () => undefined),
    releaseLease: jest.fn(async () => undefined),
    holdsLease: jest.fn(async () => true),
    scheduleExists: jest.fn(async () => true),
    deleteScheduleRun: jest.fn(async () => undefined),
    getRunsForReconciliation: jest.fn(async () => []),
    getUnbookkeptRuns: jest.fn(async () => []),
    getDeletingSchedules: jest.fn(async () => []),
  };
}

function makeDeps(
  methods: ReturnType<typeof makeMethods>,
  over: Partial<ScheduleEngineDeps> = {},
): ScheduleEngineDeps {
  return {
    methods: methods as unknown as ScheduleEngineDeps['methods'],
    getLimits: async () => LIMITS,
    getUserContext: async () => OWNER,
    isOutOfBalance: async () => false,
    agentAccess: async () => 'ok',
    hasScheduleAccess: async () => true,
    resolveFiles: async () => [],
    mintFireToken: () => 'tok',
    getSelfUrl: () => 'http://self',
    runInTenantContext: (_user, fn) => fn(),
    getJobStatus: async () => null,
    abortScheduledJob: async () => undefined,
    clearReconciledJob: async () => undefined,
    isOwnerDeleting: async () => false,
    isGloballyDisabled: async () => false,
    countActiveRunsGlobal: async () => 0,
    withGlobalCapacitySlot: (_cap: number, claim: (slot: number) => Promise<unknown>) => claim(0),
    ...over,
  } as ScheduleEngineDeps;
}

/** Builds the engine and immediately parks its timer; tests drive `runTick` directly. */
async function tickOnce(deps: ScheduleEngineDeps): Promise<void> {
  const engine = startScheduleEngine(deps);
  engine.stop();
  await engine.runTick();
}

afterEach(() => jest.restoreAllMocks());

describe('runTick error handling', () => {
  it('retains the due occurrence when a preflight query throws', async () => {
    const schedule = makeClaimedSchedule();
    const methods = makeMethods(schedule);
    await tickOnce(
      makeDeps(methods, {
        // A transient infrastructure failure on one of the preflight reads.
        getUserContext: async () => {
          throw new Error('mongo unavailable');
        },
      }),
    );
    // Advancing schedules the NEXT recurrence, so the due one would be discarded
    // permanently with no ScheduleRun row and no evidence it was ever attempted.
    // The lease is left to expire instead, which re-claims THIS occurrence.
    expect(methods.advanceSchedule).not.toHaveBeenCalled();
    // A transient read failure says nothing about the schedule's validity.
    expect(methods.disableSchedule).not.toHaveBeenCalled();
  });

  it('disables and clears an uncomputable cadence whose in-fire disable threw', async () => {
    // An unparseable timezone makes the next run uncomputable, so fireSchedule
    // disables the schedule up front — and throws out to the tick when that write
    // fails. Retrying is pointless here: the occurrence can never be computed, and
    // leaving the lease would re-claim it forever.
    const schedule = makeClaimedSchedule({ timezone: 'Not/AZone' });
    const methods = makeMethods(schedule);
    methods.disableSchedule
      .mockRejectedValueOnce(new Error('mongo unavailable') as never)
      .mockResolvedValueOnce(undefined as never);
    await tickOnce(makeDeps(methods));
    expect(methods.disableSchedule).toHaveBeenCalledTimes(2);
    // null clears nextRunAt, so the disabled schedule is no longer due.
    expect(methods.advanceSchedule).toHaveBeenCalledWith(
      'sched-1',
      null,
      schedule.nextRunAt,
      'ct-1',
    );
  });

  it('does not clear nextRunAt when the disable itself keeps failing', async () => {
    const schedule = makeClaimedSchedule({ timezone: 'Not/AZone' });
    const methods = makeMethods(schedule);
    methods.disableSchedule.mockRejectedValue(new Error('mongo unavailable') as never);
    await tickOnce(makeDeps(methods));
    // Advancing on a failed disable would leave `enabled: true` with no nextRunAt
    // and no disabledReason: permanently unclaimable and invisible to its owner.
    expect(methods.advanceSchedule).not.toHaveBeenCalled();
  });
});
