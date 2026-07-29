import type { ISchedule } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { SchedulesHandlersDeps } from './handlers';
import type { ServerRequest } from '~/types';
import { createSchedulesHandlers, toWireSchedule } from './handlers';

/** A lean schedule doc carrying both public fields and internal bookkeeping. */
function fullScheduleDoc(): ISchedule {
  return {
    _id: 'mongo-id',
    __v: 0,
    id: 'sched-1',
    user: 'user-1',
    tenantId: 't1',
    name: 'Digest',
    prompt: 'Summarize',
    agent_id: 'agent-1',
    cadence: { frequency: 'daily', hour: 8, minute: 0 },
    timezone: 'America/New_York',
    target: 'new',
    file_ids: ['file-1'],
    enabled: true,
    disabledReason: undefined,
    nextRunAt: new Date('2026-07-21T12:00:00Z'),
    lastRun: { conversationId: 'c1', status: 'success', firedAt: new Date() },
    runCount: 3,
    failureCount: 0,
    // Internal bookkeeping that must NEVER reach the browser.
    claimToken: 'ct-secret',
    leaseUntil: new Date(),
    leaseBy: 'inst-1',
    slot: 2,
    deleting: false,
    countedFor: [new Date()],
    balanceSkipCount: 1,
    bookkept: true,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-10T00:00:00Z'),
  } as unknown as ISchedule;
}

describe('toWireSchedule', () => {
  const INTERNAL_FIELDS = [
    '_id',
    '__v',
    'tenantId',
    'claimToken',
    'leaseUntil',
    'leaseBy',
    'slot',
    'deleting',
    'countedFor',
    'balanceSkipCount',
    'bookkept',
  ];

  it('emits exactly the public TSchedule fields', () => {
    const wire = toWireSchedule(fullScheduleDoc());
    expect(Object.keys(wire).sort()).toEqual(
      [
        'agent_id',
        'cadence',
        'createdAt',
        'disabledReason',
        'enabled',
        'failureCount',
        'file_ids',
        'id',
        'lastRun',
        'name',
        'nextRunAt',
        'prompt',
        'runCount',
        'target',
        'timezone',
        'updatedAt',
        'user',
      ].sort(),
    );
  });

  it('leaks no internal bookkeeping field', () => {
    const wire = toWireSchedule(fullScheduleDoc()) as Record<string, unknown>;
    for (const field of INTERNAL_FIELDS) {
      expect(wire).not.toHaveProperty(field);
    }
  });

  it('preserves the public field values', () => {
    const wire = toWireSchedule(fullScheduleDoc());
    expect(wire.id).toBe('sched-1');
    expect(wire.name).toBe('Digest');
    expect(wire.runCount).toBe(3);
    expect(wire.cadence).toEqual({ frequency: 'daily', hour: 8, minute: 0 });
  });
});

/** Minimal Express double capturing the status/body the handler settled on. */
function makeRes() {
  const captured: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
    set(name: string, value: string) {
      captured.headers[name] = value;
      return this;
    },
  };
  return { res: res as unknown as Response, captured };
}

function makeCreateReq(): ServerRequest {
  return {
    body: {
      name: 'Digest',
      prompt: 'Summarize',
      agent_id: 'agent-1',
      cadence: { frequency: 'daily', hour: 8, minute: 0 },
      timezone: 'America/New_York',
    },
    user: { id: 'user-1', tenantId: 't1', role: 'USER' },
  } as unknown as ServerRequest;
}

function makeCreateDeps(over: Partial<SchedulesHandlersDeps> = {}): SchedulesHandlersDeps {
  const methods = {
    countSchedulesByUser: jest.fn(async () => 0),
    createScheduleWithSlot: jest.fn(async (data: Partial<ISchedule>) => data as ISchedule),
    deleteScheduleById: jest.fn(async () => true),
    markScheduleDeleting: jest.fn(async () => ({ id: 'sched-1' }) as ISchedule),
    updateScheduleById: jest.fn(async () => ({ id: 'sched-1' }) as ISchedule),
  };
  return {
    methods: methods as unknown as SchedulesHandlersDeps['methods'],
    getLimits: async () => ({
      enabled: true,
      maxPerUser: 10,
      minIntervalMinutes: 60,
      autoDisableAfterFailures: 5,
      fireConcurrency: 5,
    }),
    canViewAgent: async () => true,
    filterOwnedFileIds: async (ids: string[]) => ids,
    markFilesUsed: async () => undefined,
    fireNow: async () => null,
    deleteSchedule: async () => true,
    // Passes admission, then the barrier rises before the insert lands.
    isUserDeleting: jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
    ...over,
  } as SchedulesHandlersDeps;
}

describe('createSchedule late-create compensation', () => {
  it('answers 410 when the compensating delete lands', async () => {
    const deps = makeCreateDeps();
    const { res, captured } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);
    expect(deps.methods.deleteScheduleById).toHaveBeenCalled();
    expect(deps.methods.markScheduleDeleting).not.toHaveBeenCalled();
    expect(captured.status).toBe(410);
  });

  it('falls back to the durable soft-delete when the hard delete fails', async () => {
    const deps = makeCreateDeps();
    (deps.methods.deleteScheduleById as jest.Mock).mockRejectedValue(new Error('mongo down'));
    const { res, captured } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);
    // Non-claimable at once, and erased by the reconciler's `deleting` sweep.
    expect(deps.methods.markScheduleDeleting).toHaveBeenCalledWith(expect.any(String), 'user-1');
    expect(captured.status).toBe(410);
  });

  it('refuses to report a clean 410 when no cleanup succeeded', async () => {
    const deps = makeCreateDeps();
    (deps.methods.deleteScheduleById as jest.Mock).mockRejectedValue(new Error('mongo down'));
    (deps.methods.markScheduleDeleting as jest.Mock).mockRejectedValue(new Error('mongo down'));
    const { res, captured } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);
    // 410 would claim the row is gone while the deleted user's prompt and
    // attachments stay in a live, non-TTL schedule.
    expect(captured.status).toBe(500);
  });

  /**
   * The compensation is best-effort by nature — when it runs, Mongo is usually the thing
   * failing, so no durable marker can be written either. Durability has to come from the
   * insert instead: an UNARMED row (no nextRunAt) is never claimed by the engine, so
   * even a total compensation failure cannot leave a schedule firing billed generations
   * for an account already being erased.
   */
  it('never inserts an armed row, so a failed compensation leaves an inert one', async () => {
    const deps = makeCreateDeps();
    (deps.methods.deleteScheduleById as jest.Mock).mockRejectedValue(new Error('mongo down'));
    (deps.methods.markScheduleDeleting as jest.Mock).mockRejectedValue(new Error('mongo down'));
    const { res } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);

    const inserted = (deps.methods.createScheduleWithSlot as jest.Mock).mock.calls[0][0];
    expect(inserted.nextRunAt).toBeUndefined();
    // And it is never armed afterwards, because the barrier refused the create.
    expect(deps.methods.updateScheduleById).not.toHaveBeenCalled();
  });

  it('arms the schedule only after the barrier re-check clears', async () => {
    const deps = makeCreateDeps({
      isUserDeleting: jest.fn(async () => false),
    });
    const { res, captured } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);

    expect(captured.status).toBe(201);
    const inserted = (deps.methods.createScheduleWithSlot as jest.Mock).mock.calls[0][0];
    expect(inserted.nextRunAt).toBeUndefined();
    expect(deps.methods.updateScheduleById).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      expect.objectContaining({ nextRunAt: expect.any(Date) }),
    );
  });

  /**
   * updateScheduleById filters out rows marked `deleting`, so a null arming result means
   * the deletion cascade claimed this row between the barrier re-check and the arming
   * write. Reporting the pre-delete snapshot as a 201 tells the client a schedule exists
   * that is already hidden and pending erasure.
   */
  it('does not report success when the arming write loses a delete race', async () => {
    const deps = makeCreateDeps({ isUserDeleting: jest.fn(async () => false) });
    (deps.methods.updateScheduleById as jest.Mock).mockResolvedValue(null);
    const { res, captured } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);

    expect(captured.status).toBe(410);
    expect(captured.status).not.toBe(201);
  });

  /**
   * A thrown (or ambiguously acknowledged) arming write must roll the committed row
   * back: the client retries the failed create with a fresh UUID, the retry commits a
   * second row, and the reconciler's unarmed sweep later arms the FIRST as well — one
   * intended schedule becomes several recurring, billable ones.
   */
  it('rolls back the committed row when the arming write throws', async () => {
    const deps = makeCreateDeps({ isUserDeleting: jest.fn(async () => false) });
    (deps.methods.updateScheduleById as jest.Mock).mockRejectedValue(new Error('mongo down'));
    const { res, captured } = makeRes();
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);

    expect(captured.status).toBe(500);
    expect(deps.methods.deleteScheduleById).toHaveBeenCalledWith(expect.any(String), 'user-1');
  });
});

describe('create idempotency', () => {
  const withKey = (): ServerRequest => {
    const req = makeCreateReq() as unknown as { body: Record<string, unknown> };
    req.body.clientRequestId = 'intent-1';
    return req as unknown as ServerRequest;
  };

  /**
   * The retry is the whole point: the first attempt committed a row and then failed to
   * arm, so the client cannot know what persisted. Resolving to the ORIGINAL row is
   * what keeps one user intent from becoming two recurring schedules.
   */
  it('re-arms the row a previous attempt committed instead of creating another', async () => {
    const deps = makeCreateDeps({ isUserDeleting: jest.fn(async () => false) });
    // A faithful replica of what the first attempt committed — a genuine retry sends
    // identical content, which is exactly what distinguishes it from a reused key.
    const original = {
      id: 'sched-original',
      name: 'Digest',
      prompt: 'Summarize',
      agent_id: 'agent-1',
      timezone: 'America/New_York',
      cadence: { frequency: 'daily', hour: 8, minute: 0 },
    } as ISchedule;
    (deps.methods.createScheduleWithSlot as jest.Mock).mockResolvedValue(original);
    (deps.methods.updateScheduleById as jest.Mock).mockResolvedValue(original);
    const { res, captured } = makeRes();

    await createSchedulesHandlers(deps).createSchedule(withKey(), res);

    expect(captured.status ?? 201).toBe(201);
    // Armed by the ORIGINAL id, not the uuid this attempt happened to generate.
    expect(deps.methods.updateScheduleById).toHaveBeenCalledWith(
      'sched-original',
      'user-1',
      expect.objectContaining({ nextRunAt: expect.any(Date) }),
    );
  });

  it('refuses a key reused for a different schedule', async () => {
    const deps = makeCreateDeps({ isUserDeleting: jest.fn(async () => false) });
    // Same key, but the row it resolves to is a different intent entirely.
    (deps.methods.createScheduleWithSlot as jest.Mock).mockResolvedValue({
      id: 'sched-original',
      name: 'Something else',
      prompt: 'Different prompt',
      agent_id: 'agent-9',
    } as ISchedule);
    const { res, captured } = makeRes();

    await createSchedulesHandlers(deps).createSchedule(withKey(), res);

    // A 201 here would describe a schedule the caller never asked for.
    expect(captured.status).toBe(409);
    expect(deps.methods.updateScheduleById).not.toHaveBeenCalled();
  });

  it('warns distinctly when a keyless create cannot be rolled back', async () => {
    const deps = makeCreateDeps({ isUserDeleting: jest.fn(async () => false) });
    (deps.methods.updateScheduleById as jest.Mock).mockRejectedValue(new Error('mongo down'));
    (deps.methods.deleteScheduleById as jest.Mock).mockRejectedValue(new Error('mongo down'));
    (deps.methods.markScheduleDeleting as jest.Mock).mockRejectedValue(new Error('mongo down'));
    const { res, captured } = makeRes();

    // Without an idempotency key AND with both compensation writes failing, a row can
    // survive, self-arm via the unarmed sweep, and a blind retry would add a second.
    await createSchedulesHandlers(deps).createSchedule(makeCreateReq(), res);

    expect(captured.status).toBe(500);
    expect((captured.body as { error: string }).error).toMatch(/could not roll it back/i);
  });
});

describe('deferred erase retry', () => {
  it('re-drives the erase of the caller’s soft-deleted schedules on list', async () => {
    const deps = makeCreateDeps();
    (deps.methods.getSchedulesByUser as jest.Mock) = jest.fn(async () => []);
    (deps.methods.getDeletingScheduleIds as jest.Mock) = jest.fn(async () => ['stranded-1']);
    (deps.methods.eraseScheduleIfDrained as jest.Mock) = jest.fn(async () => true);
    const { res } = makeRes();

    await createSchedulesHandlers(deps).listSchedules(
      { user: { id: 'user-1' } } as unknown as ServerRequest,
      res,
    );
    // Fire-and-forget, so let the microtask chain settle before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    expect(deps.methods.eraseScheduleIfDrained).toHaveBeenCalledWith('stranded-1');
  });
});

describe('deleteSchedule result mapping', () => {
  function makeDeleteReq(): ServerRequest {
    return {
      params: { id: 'sched-1' },
      user: { id: 'user-1', tenantId: 't1', role: 'USER' },
    } as unknown as ServerRequest;
  }

  const withResult = (result: string) =>
    makeCreateDeps({
      deleteSchedule: jest.fn(async () => result),
    } as Partial<SchedulesHandlersDeps>);

  it('404s when the schedule is not found', async () => {
    const { res, captured } = makeRes();
    await createSchedulesHandlers(withResult('not_found')).deleteSchedule(makeDeleteReq(), res);
    expect(captured.status).toBe(404);
  });

  it('answers 200 when drained and erased', async () => {
    const { res, captured } = makeRes();
    await createSchedulesHandlers(withResult('deleted')).deleteSchedule(makeDeleteReq(), res);
    expect(captured.status ?? 200).toBe(200);
    expect(captured.body).toEqual({ id: 'sched-1' });
  });

  it('answers 202 while a delivered abort is still settling', async () => {
    const { res, captured } = makeRes();
    await createSchedulesHandlers(withResult('draining')).deleteSchedule(makeDeleteReq(), res);
    expect(captured.status).toBe(202);
    expect(captured.body).toEqual({ id: 'sched-1' });
  });

  it('refuses honestly when the active run could not be confirmed stopped', async () => {
    // Reporting success would claim a possibly still-billing generation was stopped.
    const { res, captured } = makeRes();
    await createSchedulesHandlers(withResult('unconfirmed')).deleteSchedule(makeDeleteReq(), res);
    expect(captured.status).toBe(503);
  });
});
