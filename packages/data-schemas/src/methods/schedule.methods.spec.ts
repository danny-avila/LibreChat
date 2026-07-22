import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type {
  ISchedule,
  IScheduleRun,
  IScheduleDocument,
  IScheduleRunDocument,
} from '~/types/schedule';
import type { ScheduleMethods } from './schedule';
import { createScheduleMethods } from './schedule';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let Schedule: Model<IScheduleDocument>;
let ScheduleRun: Model<IScheduleRunDocument>;
let methods: ScheduleMethods;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Schedule = mongoose.models.Schedule as Model<IScheduleDocument>;
  ScheduleRun = mongoose.models.ScheduleRun as Model<IScheduleRunDocument>;
  await Schedule.init();
  await ScheduleRun.init();
  methods = createScheduleMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Schedule.deleteMany({});
  await ScheduleRun.deleteMany({});
});

let scheduleCounter = 0;

function scheduleData(overrides: Partial<ISchedule> = {}): Partial<ISchedule> {
  scheduleCounter += 1;
  return {
    id: `sched_${scheduleCounter}`,
    user: new mongoose.Types.ObjectId(),
    name: 'Morning digest',
    prompt: 'Summarize my inbox',
    agent_id: 'agent_test',
    cadence: { frequency: 'daily', hour: 8, minute: 0 },
    timezone: 'America/New_York',
    target: 'new',
    enabled: true,
    nextRunAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

function runData(
  schedule: Pick<ISchedule, 'id' | 'user'>,
  overrides: Partial<IScheduleRun> = {},
): Partial<IScheduleRun> {
  return {
    scheduleId: schedule.id,
    user: schedule.user,
    scheduledFor: new Date('2026-07-20T12:00:00Z'),
    status: 'started',
    firedAt: new Date(),
    ...overrides,
  };
}

async function getSchedule(id: string): Promise<ISchedule> {
  const schedule = await methods.getScheduleById(id);
  if (schedule == null) {
    throw new Error(`schedule ${id} not found`);
  }
  return schedule;
}

async function getRun(scheduleId: string, scheduledFor: Date): Promise<IScheduleRun> {
  const run = await ScheduleRun.findOne({ scheduleId, scheduledFor }).lean<IScheduleRun>();
  if (run == null) {
    throw new Error(`run ${scheduleId} @ ${scheduledFor.toISOString()} not found`);
  }
  return run;
}

describe('claimDueSchedule', () => {
  it('grants exactly one winner across 8 concurrent claims', async () => {
    await methods.createSchedule(scheduleData());
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        methods.claimDueSchedule({ instanceId: `inst-${i}`, leaseMs: 60_000 }),
      ),
    );
    const winners = results.filter((result) => result != null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.leaseBy).toMatch(/^inst-\d$/);
    expect(winners[0]?.leaseUntil).toBeInstanceOf(Date);
  });

  it('blocks a second claim while the lease is live', async () => {
    const created = await methods.createSchedule(scheduleData());
    const first = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 60_000 });
    expect(first?.id).toBe(created.id);
    const second = await methods.claimDueSchedule({ instanceId: 'inst-b', leaseMs: 60_000 });
    expect(second).toBeNull();
  });

  it('allows re-claim after the lease expires', async () => {
    const created = await methods.createSchedule(scheduleData());
    const first = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 50 });
    expect(first?.id).toBe(created.id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const second = await methods.claimDueSchedule({ instanceId: 'inst-b', leaseMs: 60_000 });
    expect(second?.id).toBe(created.id);
    expect(second?.leaseBy).toBe('inst-b');
  });

  it('claims due schedules in nextRunAt order', async () => {
    const now = Date.now();
    const later = await methods.createSchedule(scheduleData({ nextRunAt: new Date(now - 60_000) }));
    const earlier = await methods.createSchedule(
      scheduleData({ nextRunAt: new Date(now - 120_000) }),
    );
    const first = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 60_000 });
    const second = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 60_000 });
    const third = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 60_000 });
    expect(first?.id).toBe(earlier.id);
    expect(second?.id).toBe(later.id);
    expect(third).toBeNull();
  });

  it('never claims disabled, future, or never-scheduled schedules', async () => {
    const now = Date.now();
    await methods.createSchedule(
      scheduleData({ enabled: false, nextRunAt: new Date(now - 60_000) }),
    );
    await methods.createSchedule(scheduleData({ nextRunAt: new Date(now + 3_600_000) }));
    await methods.createSchedule(scheduleData({ nextRunAt: undefined }));
    const claimed = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 60_000 });
    expect(claimed).toBeNull();
  });
});

describe('insertScheduleRun idempotency', () => {
  it('returns null on a duplicate {scheduleId, scheduledFor} claim', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-20T12:00:00Z');
    const first = await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    const second = await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    expect(first?.status).toBe('started');
    expect(second).toBeNull();
    expect(await ScheduleRun.countDocuments({ scheduleId: schedule.id })).toBe(1);
  });

  it('inserts distinct occurrences for different scheduledFor values', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const first = await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: new Date('2026-07-20T12:00:00Z') }),
    );
    const second = await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: new Date('2026-07-21T12:00:00Z') }),
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(await ScheduleRun.countDocuments({ scheduleId: schedule.id })).toBe(2);
  });
});

describe('recordRunOutcome', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('success finalizes the run, increments runCount, and resets failure state', async () => {
    const schedule = await methods.createSchedule(
      scheduleData({
        failureCount: 2,
        balanceSkipCount: 3,
        disabledReason: 'insufficient_balance',
      }),
    );
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      conversationId: 'convo-1',
      durationMs: 1234,
      autoDisableAfterFailures: 3,
    });
    const run = await getRun(schedule.id, scheduledFor);
    expect(run.status).toBe('success');
    expect(run.conversationId).toBe('convo-1');
    expect(run.durationMs).toBe(1234);
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(1);
    expect(updated.failureCount).toBe(0);
    expect(updated.balanceSkipCount).toBe(0);
    expect(updated.disabledReason).toBeUndefined();
    expect(updated.enabled).toBe(true);
    expect(updated.lastRun?.status).toBe('success');
    expect(updated.lastRun?.conversationId).toBe('convo-1');
    expect(updated.lastRun?.firedAt).toBeInstanceOf(Date);
  });

  it('error increments failureCount without disabling below the threshold', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      error: 'provider exploded',
      autoDisableAfterFailures: 3,
    });
    const run = await getRun(schedule.id, scheduledFor);
    expect(run.status).toBe('error');
    expect(run.error).toBe('provider exploded');
    const updated = await getSchedule(schedule.id);
    expect(updated.failureCount).toBe(1);
    expect(updated.runCount).toBe(0);
    expect(updated.enabled).toBe(true);
    expect(updated.disabledReason).toBeUndefined();
    expect(updated.lastRun?.status).toBe('error');
    expect(updated.lastRun?.error).toBe('provider exploded');
  });

  it('error at the threshold disables the schedule and releases the lease', async () => {
    const schedule = await methods.createSchedule(scheduleData({ failureCount: 2 }));
    const claimed = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: 60_000 });
    expect(claimed?.id).toBe(schedule.id);
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      error: 'provider exploded',
      autoDisableAfterFailures: 3,
    });
    const updated = await getSchedule(schedule.id);
    expect(updated.failureCount).toBe(3);
    expect(updated.enabled).toBe(false);
    expect(updated.disabledReason).toBe('too_many_failures');
    expect(updated.leaseUntil).toBeUndefined();
    expect(updated.leaseBy).toBeUndefined();
  });

  it('requires_action surfaces lastRun for the card without touching counters', async () => {
    const schedule = await methods.createSchedule(scheduleData({ failureCount: 1 }));
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-paused',
      autoDisableAfterFailures: 3,
    });
    const run = await getRun(schedule.id, scheduledFor);
    expect(run.status).toBe('requires_action');
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(0);
    expect(updated.failureCount).toBe(1);
    // lastRun now reflects the pause so the card can show "Needs approval".
    expect(updated.lastRun?.status).toBe('requires_action');
    expect(updated.lastRun?.conversationId).toBe('convo-paused');
  });
});

describe('recordSkippedRun', () => {
  it('skipped_balance increments the counter and disables at the threshold', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor: new Date('2026-07-20T12:00:00Z'),
        status: 'skipped_balance',
      },
      2,
    );
    let updated = await getSchedule(schedule.id);
    expect(updated.balanceSkipCount).toBe(1);
    expect(updated.enabled).toBe(true);
    const firstRun = await getRun(schedule.id, new Date('2026-07-20T12:00:00Z'));
    expect(firstRun.status).toBe('skipped_balance');
    expect(firstRun.firedAt).toBeInstanceOf(Date);
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor: new Date('2026-07-21T12:00:00Z'),
        status: 'skipped_balance',
      },
      2,
    );
    updated = await getSchedule(schedule.id);
    expect(updated.balanceSkipCount).toBe(2);
    expect(updated.enabled).toBe(false);
    expect(updated.disabledReason).toBe('insufficient_balance');
  });

  it('skipped_overlap records the run without counter changes', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-20T12:00:00Z');
    await methods.recordSkippedRun(
      { scheduleId: schedule.id, user: schedule.user, scheduledFor, status: 'skipped_overlap' },
      2,
    );
    const run = await getRun(schedule.id, scheduledFor);
    expect(run.status).toBe('skipped_overlap');
    const updated = await getSchedule(schedule.id);
    expect(updated.balanceSkipCount).toBe(0);
    expect(updated.enabled).toBe(true);
    // the skip surfaces on the card via lastRun
    expect(updated.lastRun?.status).toBe('skipped_overlap');
  });

  it('a subsequent success resets balanceSkipCount', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor: new Date('2026-07-20T12:00:00Z'),
        status: 'skipped_balance',
      },
      3,
    );
    expect((await getSchedule(schedule.id)).balanceSkipCount).toBe(1);
    const scheduledFor = new Date('2026-07-21T12:00:00Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      conversationId: 'convo-2',
      autoDisableAfterFailures: 3,
    });
    expect((await getSchedule(schedule.id)).balanceSkipCount).toBe(0);
  });
});

describe('transitionRunStatus', () => {
  it('only transitions from the expected status (CAS)', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-20T12:00:00Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));

    const wrongFrom = await methods.transitionRunStatus(
      schedule.id,
      scheduledFor,
      'requires_action',
      'success',
    );
    expect(wrongFrom).toBe(false);
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('started');

    const paused = await methods.transitionRunStatus(
      schedule.id,
      scheduledFor,
      'started',
      'requires_action',
    );
    expect(paused).toBe(true);
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('requires_action');

    const staleFrom = await methods.transitionRunStatus(
      schedule.id,
      scheduledFor,
      'started',
      'success',
    );
    expect(staleFrom).toBe(false);

    const resumed = await methods.transitionRunStatus(
      schedule.id,
      scheduledFor,
      'requires_action',
      'success',
    );
    expect(resumed).toBe(true);
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('success');
  });
});

describe('countActiveRuns', () => {
  it('counts started runs across all schedules for the fire cap', async () => {
    expect(await methods.countActiveRuns()).toBe(0);
    const a = await methods.createSchedule(scheduleData());
    const b = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(a, { scheduledFor: new Date('2026-07-20T12:00:00Z') }));
    await methods.insertScheduleRun(runData(b, { scheduledFor: new Date('2026-07-20T13:00:00Z') }));
    expect(await methods.countActiveRuns()).toBe(2);
    // terminal + skipped runs don't count as active
    await methods.recordRunOutcome({
      scheduleId: a.id,
      scheduledFor: new Date('2026-07-20T12:00:00Z'),
      status: 'success',
      autoDisableAfterFailures: 3,
    });
    expect(await methods.countActiveRuns()).toBe(1);
  });
});

describe('hasActiveRun', () => {
  it('is true only while a started run exists', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    expect(await methods.hasActiveRun(schedule.id)).toBe(false);

    const scheduledFor = new Date('2026-07-20T12:00:00Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    expect(await methods.hasActiveRun(schedule.id)).toBe(true);

    await methods.transitionRunStatus(schedule.id, scheduledFor, 'started', 'requires_action');
    expect(await methods.hasActiveRun(schedule.id)).toBe(false);

    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: new Date('2026-07-21T12:00:00Z'), status: 'success' }),
    );
    expect(await methods.hasActiveRun(schedule.id)).toBe(false);
  });
});

describe('recordRunOutcome — reconciled completions and no-match guard', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('finalizes a resumed run from requires_action with full bookkeeping', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(schedule, { scheduledFor, status: 'requires_action' }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      conversationId: 'convo-resumed',
      autoDisableAfterFailures: 3,
    });
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('success');
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(1);
    expect(updated.lastRun?.status).toBe('success');
    expect(updated.lastRun?.conversationId).toBe('convo-resumed');
  });

  it('interrupted records lastRun without touching counters', async () => {
    const schedule = await methods.createSchedule(scheduleData({ runCount: 4, failureCount: 1 }));
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'interrupted',
      autoDisableAfterFailures: 3,
    });
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('interrupted');
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(4);
    expect(updated.failureCount).toBe(1);
    expect(updated.lastRun?.status).toBe('interrupted');
  });

  it('does not touch schedule bookkeeping when no matching run row exists', async () => {
    const schedule = await methods.createSchedule(scheduleData({ runCount: 7 }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      conversationId: 'spoofed',
      autoDisableAfterFailures: 3,
    });
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(7);
    expect(updated.lastRun).toBeUndefined();
  });
});

describe('recordRunOutcome idempotency + crash-retry (bookkeeping)', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('counts an occurrence at most once across repeated invocations', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    const outcome = {
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success' as const,
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    };
    await methods.recordRunOutcome(outcome);
    // A second call (e.g. reconciler racing the inline finish) must not re-count.
    await methods.recordRunOutcome(outcome);
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(1);
    expect((updated as { lastCountedFor?: Date }).lastCountedFor?.toISOString()).toBe(
      scheduledFor.toISOString(),
    );
    expect((await getRun(schedule.id, scheduledFor)).bookkept).toBe(true);
  });

  it('finalizeBookkeeping recovers a terminalized-but-uncounted run (crash between writes)', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    // Simulate a crash after the run row was terminalized but before bookkeeping.
    await ScheduleRun.updateOne(
      { scheduleId: schedule.id, scheduledFor },
      { $set: { status: 'success', bookkept: false } },
    );
    expect((await getSchedule(schedule.id)).runCount).toBe(0);

    const unbookkept = await methods.getUnbookkeptRuns(new Date(Date.now() + 1000), 100);
    expect(unbookkept.map((r) => r.scheduleId)).toContain(schedule.id);
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      autoDisableAfterFailures: 3,
    });
    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(1);
    expect((await getRun(schedule.id, scheduledFor)).bookkept).toBe(true);
    // No longer surfaced as needing bookkeeping.
    expect(await methods.getUnbookkeptRuns(new Date(Date.now() + 1000), 100)).toHaveLength(0);
  });
});

describe('bookkeeping policy is crash-retryable / streak-correct', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('re-applies auto-disable on a bookkeeping retry after the count already landed', async () => {
    const schedule = await methods.createSchedule(scheduleData({ failureCount: 2 }));
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    // First terminal error: increments to threshold (3) and disables.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      autoDisableAfterFailures: 3,
    });
    expect((await getSchedule(schedule.id)).enabled).toBe(false);
    // Simulate a crash where the count landed (lastCountedFor set) but the disable
    // was lost: re-enable and replay via finalizeBookkeeping. The count must NOT
    // double (guard), but the disable policy must re-apply.
    await Schedule.updateOne({ id: schedule.id }, { $set: { enabled: true } });
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      autoDisableAfterFailures: 3,
    });
    const updated = await getSchedule(schedule.id);
    expect(updated.failureCount).toBe(3); // not double-counted
    expect(updated.enabled).toBe(false); // disable re-applied
  });

  it('resets the balance-skip streak on an intervening error, then interrupt, then overlap', async () => {
    const schedule = await methods.createSchedule(scheduleData({ balanceSkipCount: 4 }));
    const outcomes: Array<[Date, 'error' | 'interrupted']> = [
      [new Date('2026-07-20T01:00:00Z'), 'error'],
      [new Date('2026-07-20T02:00:00Z'), 'interrupted'],
    ];
    for (const [when, status] of outcomes) {
      await methods.insertScheduleRun(runData(schedule, { scheduledFor: when }));
      await methods.recordRunOutcome({
        scheduleId: schedule.id,
        scheduledFor: when,
        status,
        autoDisableAfterFailures: 10,
      });
      expect((await getSchedule(schedule.id)).balanceSkipCount).toBe(0);
    }
    // Also an overlap skip breaks the streak.
    await Schedule.updateOne({ id: schedule.id }, { $set: { balanceSkipCount: 3 } });
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor: new Date('2026-07-20T03:00:00Z'),
        status: 'skipped_overlap',
      },
      5,
    );
    expect((await getSchedule(schedule.id)).balanceSkipCount).toBe(0);
  });
});

describe('getRunsForReconciliation fairness', () => {
  it('always includes started runs even behind a backlog of paused rows', async () => {
    const s = await methods.createSchedule(scheduleData());
    // Older paused rows + a newer started row; started must still be returned.
    for (let i = 0; i < 3; i++) {
      await methods.insertScheduleRun(
        runData(s, {
          scheduledFor: new Date(`2026-07-1${i}T12:00:00Z`),
          status: 'requires_action',
          firedAt: new Date('2020-01-01T00:00:00Z'),
        }),
      );
    }
    await methods.insertScheduleRun(
      runData(s, {
        scheduledFor: new Date('2026-07-25T12:00:00Z'),
        status: 'started',
        firedAt: new Date('2020-06-01T00:00:00Z'),
      }),
    );
    const runs = await methods.getRunsForReconciliation(new Date('2026-01-01T00:00:00Z'), 2);
    expect(runs.some((r) => r.status === 'started')).toBe(true);
  });
});

describe('deleteSchedulesByUser', () => {
  it('removes the user’s schedules and their runs', async () => {
    const userId = new mongoose.Types.ObjectId();
    const a = await methods.createSchedule(scheduleData({ user: userId }));
    await methods.createSchedule(scheduleData({ user: userId }));
    const other = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(a, { scheduledFor: new Date('2026-07-20T12:00:00Z') }));
    await methods.insertScheduleRun(
      runData(other, { scheduledFor: new Date('2026-07-20T12:00:00Z') }),
    );

    await methods.deleteSchedulesByUser(userId);

    expect(await methods.getSchedulesByUser(userId)).toHaveLength(0);
    expect(await getSchedule(other.id)).not.toBeNull();
    // The other user's run survives; the deleted user's runs are gone.
    expect(await ScheduleRun.countDocuments({ scheduleId: a.id })).toBe(0);
    expect(await ScheduleRun.countDocuments({ scheduleId: other.id })).toBe(1);
  });
});

describe('acquireManualRunLease / releaseLease', () => {
  it('serializes concurrent run-now attempts and can be released without advancing', async () => {
    const schedule = await methods.createSchedule(
      scheduleData({ nextRunAt: new Date('2026-08-01T12:00:00Z') }),
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        methods.acquireManualRunLease(schedule.id, schedule.user, 60_000),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);

    await methods.releaseLease(schedule.id);
    const afterRelease = await getSchedule(schedule.id);
    expect(afterRelease.leaseUntil).toBeUndefined();
    expect(afterRelease.leaseBy).toBeUndefined();
    // release must NOT reschedule the next automatic occurrence
    expect(afterRelease.nextRunAt?.toISOString()).toBe('2026-08-01T12:00:00.000Z');

    const reacquired = await methods.acquireManualRunLease(schedule.id, schedule.user, 60_000);
    expect(reacquired).toBe(true);
  });

  it('blocks against a held engine lease and rejects a non-owner', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const claimed = await methods.claimDueSchedule({ instanceId: 'engine-1', leaseMs: 60_000 });
    expect(claimed?.id).toBe(schedule.id);
    expect(await methods.acquireManualRunLease(schedule.id, schedule.user, 60_000)).toBe(false);
    expect(
      await methods.acquireManualRunLease(schedule.id, new mongoose.Types.ObjectId(), 60_000),
    ).toBe(false);
  });
});
