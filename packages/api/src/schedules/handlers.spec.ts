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
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
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
});
