import type { ScheduleEngineDeps, ScheduleLimits, ScheduleUserContext } from './types';
import type { FireableSchedule } from './types';
import { buildFireClientRequestId, fireSchedule } from './fire';
import { withCapacitySlot } from './capacity';

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
          // Mirrors the real method: a duplicate reports the EXISTING row's status so
          // the caller can tell "still running" from "already finished".
          return { conflict: 'duplicate' as const, existingStatus: runs.get(k)!.status };
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
    releaseLeaseByHolder: jest.fn(async () => undefined),
    deleteScheduleRun: jest.fn(
      async (id: string, when: Date, _status?: string, expectedConversationId?: string) => {
        const k = key(id, when);
        const row = runs.get(k) as { conversationId?: string } | undefined;
        // Mirrors the conversationId fence: a fire only deletes the row IT inserted.
        if (expectedConversationId != null && row?.conversationId !== expectedConversationId) {
          return;
        }
        runs.delete(k);
      },
    ),
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

/**
 * The chat route validates `clientRequestId` against `/^[A-Za-z0-9:_-]{1,128}$/`
 * (CLIENT_REQUEST_ID_PATTERN in api/server/controllers/agents/request.js). An id
 * outside that charset makes the route answer 400 INVALID_CLIENT_REQUEST_ID, which
 * fails EVERY fire — so the encoding is a contract, not a formatting choice.
 */
describe('buildFireClientRequestId', () => {
  const ROUTE_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

  it('stays within the charset the chat route accepts', () => {
    const id = buildFireClientRequestId(
      'sched_bf55e051-b26d-4ccc-b96c-93ffaafe1a5b',
      new Date('2026-08-01T14:05:55.132Z'),
    );

    // A raw ISO instant carries a '.' in its milliseconds, which the route rejects.
    expect(id).not.toContain('.');
    expect(id).toMatch(ROUTE_PATTERN);
  });

  it('is deterministic per occurrence and distinct across occurrences', () => {
    const scheduleId = 'sched_bf55e051-b26d-4ccc-b96c-93ffaafe1a5b';
    const first = new Date('2026-08-01T14:05:55.132Z');
    const second = new Date('2026-08-01T15:05:55.132Z');

    expect(buildFireClientRequestId(scheduleId, first)).toBe(
      buildFireClientRequestId(scheduleId, new Date(first.getTime())),
    );
    expect(buildFireClientRequestId(scheduleId, first)).not.toBe(
      buildFireClientRequestId(scheduleId, second),
    );
  });

  it('stays inside the 128-character cap', () => {
    expect(
      buildFireClientRequestId(
        'sched_bf55e051-b26d-4ccc-b96c-93ffaafe1a5b',
        new Date('2026-08-01T14:05:55.132Z'),
      ).length,
    ).toBeLessThanOrEqual(128);
  });
});

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

  it('mints a MANUAL fire token for Run Now', async () => {
    const { methods } = makeMethods();
    mockFetch(async () => okResponse());
    const mintFireToken = jest.fn(() => 'tok');
    await fireSchedule(makeDeps(methods, { mintFireToken }), makeSchedule(), LIMITS, dueAt(), {
      manual: true,
    });
    // Run Now dispatches the same billed generation over the same scoped token but
    // enforces no cadence floor and no per-user window, so it must NOT inherit the
    // automatic occurrence's exemption from the interactive message limiters.
    expect(mintFireToken).toHaveBeenCalledWith('user-1', { manual: true });
  });

  it('mints a NON-manual token for an automatic occurrence', async () => {
    const { methods } = makeMethods();
    mockFetch(async () => okResponse());
    const mintFireToken = jest.fn(() => 'tok');
    await fireSchedule(makeDeps(methods, { mintFireToken }), makeSchedule(), LIMITS, dueAt());
    // The scheduler's own caps govern these, which is what justifies the exemption.
    expect(mintFireToken).toHaveBeenCalledWith('user-1', { manual: false });
  });

  it('carries the claimed config revision on the loopback POST', async () => {
    const { methods } = makeMethods();
    mockFetch(async () => okResponse());
    await fireSchedule(
      makeDeps(methods),
      makeSchedule({ configRevision: 7 } as never),
      LIMITS,
      dueAt(),
    );
    const body = JSON.parse((global.fetch as unknown as jest.Mock).mock.calls[0][1].body as string);
    // The admission boundary revalidates this before persisting anything, so an owner
    // edit landing in the claim -> persistence window is refused rather than written
    // into the edited schedule's history.
    expect(body.scheduleConfigRevision).toBe(7);
  });

  it('treats a pre-start controller abort as superseded, not a fault', async () => {
    const { methods, calls } = makeMethods();
    // The controller's own liveness/revision fence refused the fire and already recorded
    // the occurrence. Its 200 body carries a conversationId, which previously made the
    // parser count a never-started generation as a successful fire.
    mockFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ conversationId: 'c1', status: 'aborted' }),
        }) as Response,
    );
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.fired).toBe(false);
    expect(result.skipped).toBe('superseded');
    // A delete/edit is not a schedule FAULT: no error outcome, nothing toward auto-disable.
    expect(calls.recordOutcome).toHaveLength(0);
    // The occurrence is done, so the schedule still advances past it.
    expect(calls.advance).toBe(1);
    // The lease is handed back explicitly: an owner EDIT rotates the claim token (so the
    // token-fenced advance no-ops) but never touches the lease fields — without this
    // release, Run Now and the next claim of the recomputed occurrence stay blocked for
    // the full 5-minute lease TTL.
    expect(methods.releaseLeaseByHolder).toHaveBeenCalledWith('sched-1', 'inst-1');
  });

  it('treats a message-limiter 429 as a skip, not a schedule failure', async () => {
    const { methods, runs } = makeMethods();
    mockFetch(
      async () =>
        ({
          ok: false,
          status: 429,
          text: async () => '{"message":"Too many requests"}',
        }) as Response,
    );
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt(), {
      manual: true,
    });
    expect(result.skipped).toBe('rate_limited');
    // Counting this as a failure would let an owner merely over their message quota
    // auto-disable a healthy schedule by clicking Run Now enough times.
    expect(methods.recordRunOutcome).not.toHaveBeenCalled();
    // Nothing reached the controller, so no outcome was recorded for the occurrence and
    // the reservation must not be left holding its capacity slot.
    expect([...runs.values()].filter((r) => r.status === 'started')).toHaveLength(0);
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

  it('does not let a principal override widen the global capacity cap', async () => {
    const { methods, runs } = makeMethods();
    // The single deployment-wide slot is already occupied.
    runs.set('other-0:x', { status: 'started', capacitySlot: 0 });
    mockFetch(async () => okResponse());
    const deps = makeDeps(methods, {
      // Base allows 1 concurrent scheduled generation; this owner's role/tenant
      // override raises their limit to 5.
      getLimits: async (user) => ({ ...LIMITS, fireConcurrency: user ? 5 : 1 }),
    });
    // Run Now resolves the OWNER's limits and skips the tick's base-config budget, so
    // without the clamp the override would hand out slots 1-4 and run five billed
    // generations against a deployment that advertises a cap of one.
    const result = await fireSchedule(deps, makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('capacity');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(methods.reserveStartedRun).not.toHaveBeenCalled();
  });

  it('still honors an owner override that is STRICTER than the deployment cap', async () => {
    const { methods, runs } = makeMethods();
    runs.set('other-0:x', { status: 'started', capacitySlot: 0 });
    mockFetch(async () => okResponse());
    const deps = makeDeps(methods, {
      getLimits: async (user) => ({ ...LIMITS, fireConcurrency: user ? 1 : 5 }),
    });
    // Only WIDENING is the defect; a tenant that wants less concurrency than the
    // deployment allows must still get it.
    const result = await fireSchedule(deps, makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('capacity');
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

  it('does not reserve a run when the claim already lapsed during preflight', async () => {
    const { methods, runs } = makeMethods();
    // The preflight (user/config/permission/balance/attachment queries) outlasted the
    // 5-minute lease and another worker re-claimed the occurrence.
    (methods.revalidateClaim as jest.Mock).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    // Reserving here would win the occurrence's unique row: the FRESH claimer would then
    // see `duplicate` and advance without firing, while this worker's own revalidation
    // fails and rollbackReservation deliberately retains the row (leaseBy changed). The
    // occurrence would be lost with its capacity slot held until the orphan sweep.
    expect(methods.reserveStartedRun).not.toHaveBeenCalled();
    expect([...runs.entries()].some(([k]) => k.startsWith('sched-1:'))).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    // The lease is handed back by holder so the fresh claimer is not left waiting.
    expect(methods.releaseLeaseByHolder).toHaveBeenCalledWith('sched-1', 'inst-1');
  });

  /**
   * A failed revalidation must NEVER advance. In every true supersession (takeover,
   * owner edit) the claim token rotated, so an advance would no-op anyway — the only
   * case where it can land is a PURE lease expiry with no takeover, where the token
   * never rotated. advanceSchedule checks no lease, so that advance moved nextRunAt
   * past an occurrence nothing had fired: a slow preflight silently DROPPED it
   * instead of leaving it due for the next claim to retry.
   */
  it('leaves the occurrence due when only the lease expired (no takeover)', async () => {
    const { methods } = makeMethods();
    // Same claim token, merely past leaseUntil: revalidateClaim fails on the lease
    // predicate alone while the token-fenced advance filter would still MATCH.
    (methods.revalidateClaim as jest.Mock).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    expect(methods.advanceSchedule).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never advances from any superseded branch, including post-reserve', async () => {
    const { methods } = makeMethods();
    (methods.revalidateClaim as jest.Mock).mockResolvedValueOnce(true).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    expect(methods.advanceSchedule).not.toHaveBeenCalled();
  });

  /**
   * The lease can expire between the pre-reserve revalidation and the reservation
   * itself: the capacity allocator reads occupancy in between, and the preflight
   * before it can already have outlasted the 5-minute lease. Gating the rollback on
   * lease ownership stranded the row — the new holder's own reserve saw `duplicate`
   * and advanced past the occurrence without firing it, while this row held a global
   * capacity slot until the 30-minute orphan sweep.
   */
  it('deletes its own undispatched reservation even after a lease takeover', async () => {
    const { methods, runs } = makeMethods();
    // Valid at the pre-reserve check, superseded by the pre-POST one: that ordering IS
    // the scenario, since a claim already dead before reserving never reserves at all.
    (methods.revalidateClaim as jest.Mock).mockResolvedValueOnce(true).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    // Nothing was dispatched for this row, so it is unambiguously this fire's garbage.
    expect(methods.deleteScheduleRun).toHaveBeenCalledWith(
      'sched-1',
      expect.any(Date),
      'started',
      expect.any(String),
    );
    expect([...runs.entries()].some(([k]) => k.startsWith('sched-1:'))).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rechecks shutdown immediately before dispatch and rolls back the reservation', async () => {
    const { methods, runs } = makeMethods();
    // The coordinator flips AFTER the pre-reservation gate: the deployment-limit
    // read, capacity allocation, and claim revalidation all run in between and can
    // overlap SIGTERM. Without the recheck the POST lands on a closing listener —
    // booked as an error (or a refused connect that advances the occurrence).
    const isShuttingDown = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(
      makeDeps(methods, { isShuttingDown }),
      makeSchedule(),
      LIMITS,
      dueAt(),
    );
    expect(result.skipped).toBe('superseded');
    expect(global.fetch).not.toHaveBeenCalled();
    // Rolled back, not advanced: the occurrence stays due for the restarted process.
    expect(methods.advanceSchedule).not.toHaveBeenCalled();
    expect([...runs.entries()].some(([k]) => k.startsWith('sched-1:'))).toBe(false);
  });

  it('deletes the reserved run when the schedule was hard-deleted mid-fire', async () => {
    const { methods, runs } = makeMethods();
    // Account deletion hard-deleted the schedule after this fire reserved its run.
    (methods.revalidateClaim as jest.Mock).mockResolvedValueOnce(true).mockResolvedValue(false);
    mockFetch(async () => okResponse());
    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, dueAt());
    expect(result.skipped).toBe('superseded');
    // The orphaned reservation (no schedule left to own it) is deleted, not leaked.
    expect(methods.deleteScheduleRun).toHaveBeenCalledWith(
      'sched-1',
      expect.any(Date),
      'started',
      expect.any(String),
    );
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

  /**
   * A balance skip is not a no-op: it stamps the card and walks the balance-skip streak
   * toward auto-disable. The preflight above it (user, config, permission and balance
   * lookups) can outlast the 5-minute lease, so writing it under a dead claim is a write
   * on behalf of a fire that no longer owns the occurrence.
   */
  it('does not record a balance skip under a superseded claim', async () => {
    const { methods, calls } = makeMethods();
    (methods.revalidateClaim as jest.Mock).mockResolvedValue(false);
    mockFetch(async () => okResponse());

    const result = await fireSchedule(
      makeDeps(methods, { isOutOfBalance: async () => true }),
      makeSchedule(),
      LIMITS,
      dueAt(),
    );

    expect(result.skipped).toBe('superseded');
    expect(methods.recordSkippedRun).not.toHaveBeenCalled();
    expect(calls.skipped).toEqual([]);
  });

  it('records the balance skip normally while the claim is still valid', async () => {
    const { methods, calls } = makeMethods();
    mockFetch(async () => okResponse());

    const result = await fireSchedule(
      makeDeps(methods, { isOutOfBalance: async () => true }),
      makeSchedule(),
      LIMITS,
      dueAt(),
    );

    expect(result.skipped).toBe('balance');
    expect(calls.skipped).toEqual(['skipped_balance']);
  });

  /**
   * A `duplicate` means ANOTHER worker holds this occurrence's row — not that the
   * occurrence is done. Advancing past it hands the occurrence away: if that other
   * worker is a stale lease holder whose own revalidation then fails, it rolls its
   * undispatched row back and NOTHING ever fires the occurrence. Leaving nextRunAt
   * alone keeps it claimable; the worker that actually dispatches is the one that
   * advances, and the claim's lease provides the retry backoff.
   */
  /**
   * A settled-but-unadvanced occurrence (its fire was accepted, the post-accept advance
   * failed) leaves nextRunAt pointing at it. Refusing to advance on `duplicate` then
   * makes every future claim re-pick the same finished occurrence — a permanent stall.
   */
  it('advances past a duplicate whose run already settled', async () => {
    const { methods, runs, calls } = makeMethods();
    const when = new Date(dueAt().getTime());
    runs.set(`sched-1:${when.toISOString()}`, { status: 'success', conversationId: 'done' });
    mockFetch(async () => okResponse());

    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, when);

    expect(result.skipped).toBe('duplicate');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(calls.advance).toBe(1);
  });

  it('does not advance past an occurrence another worker is holding', async () => {
    const { methods, runs, calls } = makeMethods();
    const when = new Date(dueAt().getTime());
    // A peer already reserved this occurrence's row.
    runs.set(`sched-1:${when.toISOString()}`, {
      status: 'started',
      conversationId: 'peer-convo',
    });
    mockFetch(async () => okResponse());

    const result = await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, when);

    expect(result.skipped).toBe('duplicate');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(calls.advance).toBe(0);
  });

  it('releases the lease on a duplicate for run-now so the user can retry', async () => {
    const { methods, runs, calls } = makeMethods();
    const when = new Date(dueAt().getTime());
    runs.set(`sched-1:${when.toISOString()}`, { status: 'started' });
    mockFetch(async () => okResponse());

    await fireSchedule(makeDeps(methods), makeSchedule(), LIMITS, when, { manual: true });

    // Automatic claims keep the lease as backoff; a manual click must not be told
    // "already in progress" for the full lease TTL.
    expect(calls.releaseLease).toBe(1);
    expect(calls.advance).toBe(0);
  });
});
