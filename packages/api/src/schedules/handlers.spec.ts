import type { ISchedule } from '@librechat/data-schemas';
import { toWireSchedule } from './handlers';

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
