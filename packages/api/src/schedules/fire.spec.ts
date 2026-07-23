import type { ScheduleEngineDeps, ScheduleLimits, ScheduleUserContext } from './types';
import type { FireableSchedule } from './types';
import { withCapacitySlot } from './capacity';
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
  const runs = new Map<
    string,
    { status: string; conversationId?: string; capacitySlot?: number }
  >();
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
      async (data: {
        scheduleId: string;
        scheduledFor: Date;
        conversationId?: string;
        capacitySlot?: number;
      }) => {
        const k = key(data.scheduleId, data.scheduledFor);
        if (runs.has(k)) {
          return { conflict: 'duplicate' as const };
        }
        // Mirrors the unique {capacitySlot} partial index (status:'started').
        if (
          data.capacitySlot != null &&
          [...runs.values()].some(
            (r) => r.status === 'started' && r.capacitySlot === data.capacitySlot,
          )
        ) {
          return { conflict: 'slot-taken' as const };
        }
        const overlap = [...runs.entries()].some(
          ([rk, r]) => rk.startsWith(`${data.scheduleId}:`) && r.status === 'started',
        );
        if (overlap) {
          return { conflict: 'overlap' as const };
        }
        runs.set(k, {
          status: 'started',
          conversationId: data.conversationId,
          capacitySlot: data.capacitySlot,
        });
        return { run: { scheduleId: data.scheduleId, scheduledFor: data.scheduledFor } };
      },
    ),
    getCapacityOccupancy: jest.fn(async () => {
      const takenSlots: number[] = [];
      let unslotted = 0;
      for (const r of runs.values()) {
        if (r.status !== 'started') {
          continue;
        }
        if (typeof r.capacitySlot === 'number') {
          takenSlots.push(r.capacitySlot);
        } else {
          unslotted += 1;
        }
      }
      return { takenSlots, unslotted };
    }),
    revalidateClaim: jest.fn(async () => true),
    holdsLease: jest.fn(async () => true),
    scheduleExists: jest.fn(async () => true),
    releaseLeaseByHolder: jest.fn(async () => undefined),
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
    isOwnerDeleting: async () => false,
    isGloballyDisabled: async () => false,
    countActiveRunsGlobal: async () => methods.countActiveRuns(),
    withGlobalCapacitySlot: (cap: number, claim: (slot: number) => Promise<unknown>) =>
      withCapacitySlot(
        cap,
        () => methods.getCapacityOccupancy(),
        claim as Parameters<typeof withCapacitySlot>[2],
      ),
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
    // The accept path answers with JSON; fire reads the body as text and JSON-parses it.
    text: async () => JSON.stringify({ conversationId }),
  }) as Response;

// A 200 whose body is a denyRequest SSE stream (moderation/ban) rather than JSON.
const sseDenyResponse = () =>
  ({
    ok: true,
    status: 200,
    text: async () => 'event: message\ndata: {"message":"denied"}\n\n',
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

  it('records a pre-controller SSE denial as a definite error (not ambiguous)', async () => {
    const { methods, runs, calls } = makeMethods();
    // denyRequest (moderation/ban) streams an SSE error with HTTP 200 before the
    // controller starts — a definite rejection with nothing billed/started. It must
    // terminalize as `error` (so failures count toward auto-disable), NOT be left
    // reconcilable and later swept to `interrupted`.
    mockFetch(async () => sseDenyResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(false);
    expect(calls.recordOutcome).toEqual([{ status: 'error' }]);
    // The reserved run row is terminalized, not left `started` for the orphan sweep.
    expect([...runs.values()][0].status).toBe('error');
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

  it('refuses the fire at the global capacity cap WITHOUT inserting a run', async () => {
    const { methods, runs } = makeMethods();
    // All 5 slots taken → the allocator finds no free slot and never inserts.
    for (let i = 0; i < 5; i++) {
      runs.set(`other-${i}:x`, { status: 'started', capacitySlot: i });
    }
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('capacity');
    expect(global.fetch).not.toHaveBeenCalled();
    // Slot-based capacity is decided BEFORE the write, so there is nothing to roll back.
    expect([...runs.values()].filter((r) => r.status === 'started')).toHaveLength(5);
    expect(methods.reserveStartedRun).not.toHaveBeenCalled();
    expect(methods.deleteScheduleRun).not.toHaveBeenCalled();
  });

  it('claims a free slot and never exceeds the cap when slots collide', async () => {
    const { methods, runs } = makeMethods();
    // Slots 0 and 2 are taken; the allocator must land the fire on slot 1.
    runs.set('other-a:x', { status: 'started', capacitySlot: 0 });
    runs.set('other-b:x', { status: 'started', capacitySlot: 2 });
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(true);
    const own = [...runs.entries()].find(([k]) => k.startsWith('sched-1:'));
    expect(own?.[1].capacitySlot).toBe(1);
  });

  it('re-fires cleanly next tick once capacity frees, exactly once', async () => {
    const { methods, runs } = makeMethods();
    for (let i = 0; i < 5; i++) {
      runs.set(`other-${i}:x`, { status: 'started', capacitySlot: i });
    }
    mockFetch(async () => okResponse());
    const schedule = makeSchedule();
    const when = dueAt();
    // Tick 1: every slot taken → refused before any insert.
    const first = await fireSchedule(makeDeps(methods), schedule, LIMITS, when);
    expect(first.skipped).toBe('capacity');
    // Capacity frees up before the next tick.
    runs.delete('other-0:x');
    // Tick 2: same occurrence re-claimed → now fires, exactly one live run.
    const second = await fireSchedule(makeDeps(methods), schedule, LIMITS, when);
    expect(second.fired).toBe(true);
    expect(methods.reserveStartedRun).toHaveBeenCalledTimes(1); // only the successful tick inserts
    expect(
      [...runs.entries()].filter(([k, r]) => k.startsWith('sched-1:') && r.status === 'started'),
    ).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves the reserved run for reconcile when the lease was taken over', async () => {
    const { methods, runs } = makeMethods();
    // An owner edit/takeover superseded this fire after it reserved its run, which is
    // the path that now drives rollbackReservation (capacity no longer inserts at all).
    (methods.revalidateClaim as jest.Mock).mockResolvedValue(false);
    // Simulate a lease takeover: this worker no longer holds the claim.
    (methods.holdsLease as jest.Mock).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    // The reserved row must NOT be deleted (another worker owns the occurrence now);
    // it's left for the reconciler so the occurrence stays reconcilable.
    expect(methods.deleteScheduleRun).not.toHaveBeenCalled();
    expect([...runs.entries()].some(([k]) => k.startsWith('sched-1:'))).toBe(true);
  });

  it('deletes the reserved run when the schedule was hard-deleted mid-fire', async () => {
    const { methods, runs } = makeMethods();
    // Account deletion hard-deleted the schedule after this fire reserved its run:
    // revalidation fails, the lease is not held AND the schedule no longer exists.
    (methods.revalidateClaim as jest.Mock).mockResolvedValue(false);
    (methods.holdsLease as jest.Mock).mockResolvedValue(false);
    (methods.scheduleExists as jest.Mock).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    // The orphaned reservation (no schedule left to own it) is deleted, not leaked.
    expect(methods.deleteScheduleRun).toHaveBeenCalledWith('sched-1', expect.any(Date), 'started');
    expect([...runs.entries()].some(([k]) => k.startsWith('sched-1:'))).toBe(false);
  });

  it('records a pre-connect fetch failure (bad self URL) as a definite error', async () => {
    const { methods, runs, calls } = makeMethods();
    // A DNS/connection failure before the request reaches the server: nothing started,
    // so it must terminalize as `error` (countable) rather than stay reconcilable.
    mockFetch(async () => {
      const err = new TypeError('fetch failed');
      (err as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
      throw err;
    });
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(false);
    expect(calls.recordOutcome).toEqual([{ status: 'error' }]);
    expect([...runs.values()][0].status).toBe('error');
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
