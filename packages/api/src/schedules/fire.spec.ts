import type { ScheduleEngineDeps, ScheduleLimits, ScheduleUserContext } from './types';
import type { FireableSchedule } from './types';
import { fireSchedule } from './fire';

const OWNER: ScheduleUserContext = { id: 'user-1', tenantId: 't1', role: 'USER' };
const LIMITS: ScheduleLimits = {
  enabled: true,
  maxPerUser: 10,
  minIntervalMinutes: 60,
  autoDisableAfterFailures: 5,
  fireConcurrency: 5,
};

function makeSchedule(overrides: Partial<FireableSchedule> = {}): FireableSchedule {
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
    runCount: 0,
    failureCount: 0,
    balanceSkipCount: 0,
    ...overrides,
  } as FireableSchedule;
}

/** In-memory run store exercising the real insert/count/delete/idempotency interplay. */
function makeMethods() {
  const runs = new Map<string, { status: string; conversationId?: string }>();
  const calls = {
    advance: 0,
    releaseLease: 0,
    disable: [] as string[],
    recordOutcome: [] as { status: string }[],
    skipped: [] as string[],
    setFireDetails: 0,
  };
  const key = (id: string, when: Date) => `${id}:${when.toISOString()}`;
  const methods = {
    releaseLease: jest.fn(async () => {
      calls.releaseLease += 1;
    }),
    advanceSchedule: jest.fn(async () => {
      calls.advance += 1;
    }),
    disableSchedule: jest.fn(async (_id: string, reason: string) => {
      calls.disable.push(reason);
    }),
    hasActiveRun: jest.fn(async (id: string) =>
      [...runs.entries()].some(([k, r]) => k.startsWith(`${id}:`) && r.status === 'started'),
    ),
    countActiveRuns: jest.fn(
      async () => [...runs.values()].filter((r) => r.status === 'started').length,
    ),
    insertScheduleRun: jest.fn(
      async (data: { scheduleId: string; scheduledFor: Date; conversationId?: string }) => {
        const k = key(data.scheduleId, data.scheduledFor);
        if (runs.has(k)) {
          return null; // unique {scheduleId, scheduledFor}
        }
        runs.set(k, { status: 'started', conversationId: data.conversationId });
        return { scheduleId: data.scheduleId, scheduledFor: data.scheduledFor };
      },
    ),
    // Mirrors the partial-unique-index semantics: same-occurrence row => 'duplicate';
    // any OTHER started run for the schedule => 'overlap'; else reserve the slot.
    reserveStartedRun: jest.fn(
      async (data: { scheduleId: string; scheduledFor: Date; conversationId?: string }) => {
        const k = key(data.scheduleId, data.scheduledFor);
        if (runs.has(k)) {
          return { conflict: 'duplicate' as const };
        }
        const overlap = [...runs.entries()].some(
          ([rk, r]) => rk.startsWith(`${data.scheduleId}:`) && r.status === 'started',
        );
        if (overlap) {
          return { conflict: 'overlap' as const };
        }
        runs.set(k, { status: 'started', conversationId: data.conversationId });
        return { run: { scheduleId: data.scheduleId, scheduledFor: data.scheduledFor } };
      },
    ),
    revalidateClaim: jest.fn(async () => true),
    holdsLease: jest.fn(async () => true),
    deleteScheduleRun: jest.fn(async (id: string, when: Date, _status?: string) => {
      runs.delete(key(id, when));
    }),
    setRunFireDetails: jest.fn(async () => {
      calls.setFireDetails += 1;
    }),
    recordSkippedRun: jest.fn(async (data: { status: string }) => {
      calls.skipped.push(data.status);
    }),
    recordRunOutcome: jest.fn(
      async (data: { scheduleId: string; scheduledFor: Date; status: string }) => {
        const k = key(data.scheduleId, data.scheduledFor);
        if (runs.has(k)) {
          runs.set(k, { status: data.status });
        }
        calls.recordOutcome.push({ status: data.status });
      },
    ),
  };
  return { methods, runs, calls };
}

function makeDeps(
  methods: ReturnType<typeof makeMethods>['methods'],
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
    isJobStoreShared: () => true,
    countActiveRunsGlobal: async () => methods.countActiveRuns(),
    ...over,
  } as ScheduleEngineDeps;
}

function mockFetch(impl: () => Promise<unknown> | never) {
  global.fetch = jest.fn(impl as never) as never;
}

const okResponse = (conversationId = 'convo-1') =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ conversationId }),
    text: async () => '',
  }) as Response;

const dueAt = () => new Date(Date.now() - 60_000);

afterEach(() => jest.restoreAllMocks());

describe('fireSchedule', () => {
  it('fires the happy path and records fire details', async () => {
    const { methods, runs } = makeMethods();
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(true);
    // The conversation id is pre-generated and recorded on the run row up front
    // (so reconciliation can always find the occurrence's job), not read back from
    // the POST response.
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect([...runs.values()][0].conversationId).toBe(result.conversationId);
    expect(methods.setRunFireDetails).toHaveBeenCalledTimes(1);
    expect([...runs.values()][0].status).toBe('started');
  });

  it('records a definite HTTP rejection as error', async () => {
    const { methods, calls } = makeMethods();
    mockFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response);
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(false);
    expect(calls.recordOutcome).toEqual([{ status: 'error' }]);
  });

  it('leaves an ambiguous network failure reconcilable (started, not terminalized)', async () => {
    const { methods, runs, calls } = makeMethods();
    mockFetch(async () => {
      throw new Error('ECONNRESET');
    });
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(false);
    // Not terminalized — the run stays `started` for reconciliation.
    expect(calls.recordOutcome).toHaveLength(0);
    expect([...runs.values()][0].status).toBe('started');
    expect(calls.advance).toBe(1);
  });

  it('does not orphan a run when file resolution fails', async () => {
    const { methods, runs, calls } = makeMethods();
    mockFetch(async () => okResponse());
    const deps = makeDeps(methods, {
      resolveFiles: async () => {
        throw new Error('db down');
      },
    });
    const result = await fireSchedule(deps, makeSchedule({ file_ids: ['f1'] }), LIMITS, dueAt());
    expect(result.fired).toBe(false);
    expect(runs.size).toBe(0); // no run row created
    // Automatic fire KEEPS the claim lease as a backoff (nextRunAt untouched → the
    // occurrence retries when the lease expires) so a transient file error can't get
    // this row re-claimed every tick and starve others.
    expect(calls.releaseLease).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('releases the lease on a manual run-now when file resolution fails', async () => {
    const { methods, runs, calls } = makeMethods();
    mockFetch(async () => okResponse());
    const deps = makeDeps(methods, {
      resolveFiles: async () => {
        throw new Error('db down');
      },
    });
    const result = await fireSchedule(deps, makeSchedule({ file_ids: ['f1'] }), LIMITS, dueAt(), {
      manual: true,
    });
    expect(result.fired).toBe(false);
    expect(runs.size).toBe(0);
    // Run-now releases so the user can retry immediately (no misleading lease-held 409).
    expect(calls.releaseLease).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rolls back the reservation when over the global capacity cap', async () => {
    const { methods, runs } = makeMethods();
    // 5 already active → this insert makes 6 > cap(5), so it must roll back.
    for (let i = 0; i < 5; i++) {
      runs.set(`other-${i}:x`, { status: 'started' });
    }
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('capacity');
    expect(global.fetch).not.toHaveBeenCalled();
    // The reservation was rolled back — only the 5 pre-existing remain.
    expect([...runs.values()].filter((r) => r.status === 'started')).toHaveLength(5);
    expect(methods.deleteScheduleRun).toHaveBeenCalledTimes(1);
  });

  it('capacity rollback re-fires cleanly next tick, exactly once', async () => {
    const { methods, runs } = makeMethods();
    for (let i = 0; i < 5; i++) {
      runs.set(`other-${i}:x`, { status: 'started' });
    }
    mockFetch(async () => okResponse());
    const schedule = makeSchedule();
    const when = dueAt();
    // Tick 1: at capacity → rolled back.
    const first = await fireSchedule(makeDeps(methods), schedule, LIMITS, when);
    expect(first.skipped).toBe('capacity');
    // Capacity frees up before the next tick.
    runs.delete('other-0:x');
    // Tick 2: same occurrence re-claimed → now fires, exactly one live run.
    const second = await fireSchedule(makeDeps(methods), schedule, LIMITS, when);
    expect(second.fired).toBe(true);
    expect(methods.reserveStartedRun).toHaveBeenCalledTimes(2); // reserve, rollback, reserve
    expect(
      [...runs.entries()].filter(([k, r]) => k.startsWith('sched-1:') && r.status === 'started'),
    ).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the reserved run for reconcile when the lease was taken over', async () => {
    const { methods, runs } = makeMethods();
    // At capacity, so this fire will roll back its reservation.
    for (let i = 0; i < 5; i++) {
      runs.set(`other-${i}:x`, { status: 'started' });
    }
    // Simulate a lease takeover: this worker no longer holds the claim.
    (methods.holdsLease as jest.Mock).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('capacity');
    // The reserved row must NOT be deleted (another worker owns the occurrence now);
    // it's left for the reconciler so the occurrence stays reconcilable.
    expect(methods.deleteScheduleRun).not.toHaveBeenCalled();
    expect([...runs.entries()].some(([k]) => k.startsWith('sched-1:'))).toBe(true);
  });

  it('skips overlap when a prior run is still active', async () => {
    const { methods, runs, calls } = makeMethods();
    runs.set('sched-1:prior', { status: 'started' });
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('overlap');
    expect(calls.skipped).toEqual(['skipped_overlap']);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('disables and stops firing when agent VIEW access was revoked', async () => {
    const { methods, calls } = makeMethods();
    const deps = makeDeps(methods, { agentAccess: async () => 'forbidden' });
    const result = await fireSchedule(deps, makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('permission_revoked');
    expect(calls.disable).toEqual(['permission_revoked']);
  });

  it('skips a duplicate occurrence (idempotency claim already held)', async () => {
    const { methods, runs } = makeMethods();
    runs.set(`sched-1:${dueAt().toISOString()}`, { status: 'requires_action' });
    mockFetch(async () => okResponse());
    const when = new Date(dueAt().getTime());
    runs.set(`sched-1:${when.toISOString()}`, { status: 'requires_action' });
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, when);
    expect(result.skipped).toBe('duplicate');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
