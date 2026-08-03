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
import { createUserMethods } from './user';
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
let userMethods: ReturnType<typeof createUserMethods>;

/** Standing up a real in-memory MongoDB plus index builds routinely outruns the
 *  15s default hook timeout when the suite runs alongside the rest of the package
 *  (and on a cold binary cache), which failed all 115 tests on an unrelated-looking
 *  beforeAll timeout. The work itself takes ~2s idle; this is headroom, not a
 *  slow expectation. */
const DB_SETUP_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Schedule = mongoose.models.Schedule as Model<IScheduleDocument>;
  ScheduleRun = mongoose.models.ScheduleRun as Model<IScheduleRunDocument>;
  await Schedule.init();
  await ScheduleRun.init();
  methods = createScheduleMethods(mongoose);
  userMethods = createUserMethods(mongoose);
}, DB_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

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

  it('allows re-claim after the lease expires past the skew margin', async () => {
    const created = await methods.createSchedule(scheduleData());
    // Takeover requires expiry to be at least LEASE_SKEW_MARGIN_MS in the past
    // (worker-clock comparisons tolerate inter-replica skew), so lease a NEGATIVE
    // duration deep enough to clear the margin instead of sleeping it out.
    const first = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: -31_000 });
    expect(first?.id).toBe(created.id);
    const second = await methods.claimDueSchedule({ instanceId: 'inst-b', leaseMs: 60_000 });
    expect(second?.id).toBe(created.id);
    expect(second?.leaseBy).toBe('inst-b');
  });

  it('does not take over a lease expired less than the skew margin ago', async () => {
    await methods.createSchedule(scheduleData());
    // Expired 1s ago by this clock — within the margin, so a skew-behind holder may
    // still legitimately consider it live.
    const first = await methods.claimDueSchedule({ instanceId: 'inst-a', leaseMs: -1_000 });
    expect(first).not.toBeNull();
    const contender = await methods.claimDueSchedule({ instanceId: 'inst-b', leaseMs: 60_000 });
    expect(contender).toBeNull();
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
    // Terminal status so the single-active partial index (one `started` per
    // schedule) doesn't interfere — this asserts occurrence-level distinctness.
    const schedule = await methods.createSchedule(scheduleData());
    const first = await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: new Date('2026-07-20T12:00:00Z'), status: 'success' }),
    );
    const second = await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: new Date('2026-07-21T12:00:00Z'), status: 'success' }),
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(await ScheduleRun.countDocuments({ scheduleId: schedule.id })).toBe(2);
  });
});

describe('recordSkippedRun duplicate-occurrence guard', () => {
  it('does not overwrite lastRun/counters when the occurrence already fired', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const when = new Date('2026-07-20T12:00:00Z');
    // The occurrence already ran to success (e.g. a claim retry after the POST was
    // accepted but the lease advance failed).
    await methods.insertScheduleRun(runData(schedule, { scheduledFor: when, status: 'success' }));
    // A stale balance preflight must NOT relabel that occurrence as a balance skip.
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor: when,
        status: 'skipped_balance',
      },
      5,
    );
    const after = await getSchedule(schedule.id);
    expect(after.lastRun).toBeUndefined();
    expect(after.balanceSkipCount).toBe(0);
    expect(await getRun(schedule.id, when)).toMatchObject({ status: 'success' });
  });
});

describe('settledAt retention marker', () => {
  it('stamps settledAt on terminal outcomes but never on a pause', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const when = new Date('2026-07-20T12:00:00Z');
    await methods.reserveStartedRun(runData(schedule, { scheduledFor: when }));

    // The retention TTL index expires on `settledAt`, so a PAUSE must not carry it:
    // an approval window longer than the retention period would otherwise let Mongo
    // reap a still-live requires_action row out from under its retained job.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: when,
      status: 'requires_action',
      autoDisableAfterFailures: 5,
    });
    expect((await getRun(schedule.id, when)).settledAt).toBeUndefined();

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: when,
      status: 'success',
      autoDisableAfterFailures: 5,
    });
    expect((await getRun(schedule.id, when)).settledAt).toBeInstanceOf(Date);
  });

  it('stamps settledAt on skip rows inserted terminal', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const when = new Date('2026-07-20T12:00:00Z');
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor: when,
        status: 'skipped_overlap',
      },
      5,
    );
    expect((await getRun(schedule.id, when)).settledAt).toBeInstanceOf(Date);
  });
});

describe('reserveStartedRun (single-active overlap guard)', () => {
  it('reserves the slot, then rejects a concurrent occurrence as overlap', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const first = await methods.reserveStartedRun(
      runData(schedule, { scheduledFor: new Date('2026-07-20T12:00:00Z') }),
    );
    const second = await methods.reserveStartedRun(
      runData(schedule, { scheduledFor: new Date('2026-07-21T12:00:00Z') }),
    );
    expect('run' in first).toBe(true);
    expect(second).toEqual({ conflict: 'overlap' });
    // Once the first terminalizes it leaves the active index, so the next occurrence reserves.
    await ScheduleRun.updateOne(
      { scheduleId: schedule.id, scheduledFor: new Date('2026-07-20T12:00:00Z') },
      { $set: { status: 'success' } },
    );
    const third = await methods.reserveStartedRun(
      runData(schedule, { scheduledFor: new Date('2026-07-21T12:00:00Z') }),
    );
    expect('run' in third).toBe(true);
  });

  it('reports a re-fired same occurrence as duplicate', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const when = new Date('2026-07-20T12:00:00Z');
    await methods.reserveStartedRun(runData(schedule, { scheduledFor: when }));
    await ScheduleRun.updateOne(
      { scheduleId: schedule.id, scheduledFor: when },
      { $set: { status: 'success' } },
    );
    const again = await methods.reserveStartedRun(runData(schedule, { scheduledFor: when }));
    // The status travels with the conflict: this exact case (settled row, occurrence
    // never advanced past) is the one the caller must ADVANCE past rather than treat as
    // owned by a live worker.
    expect(again).toEqual({ conflict: 'duplicate', existingStatus: 'success' });
  });
});

describe('createScheduleWithSlot (atomic per-user cap)', () => {
  it('allows exactly maxPerUser and reports limit under concurrency', async () => {
    const user = new mongoose.Types.ObjectId();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => methods.createScheduleWithSlot(scheduleData({ user }), 3)),
    );
    const created = results.filter((r) => r !== 'limit');
    expect(created).toHaveLength(3);
    expect(results.filter((r) => r === 'limit')).toHaveLength(5);
    // Distinct slots [0,3) were assigned — the partial unique index is the arbiter.
    const slots = new Set(
      (created as ISchedule[]).map((s) => s.slot).filter((s) => typeof s === 'number'),
    );
    expect(slots.size).toBe(3);
    expect(await methods.countSchedulesByUser(user)).toBe(3);
  });

  it('frees a slot on delete so a new create can take it', async () => {
    const user = new mongoose.Types.ObjectId();
    const a = (await methods.createScheduleWithSlot(scheduleData({ user }), 2)) as ISchedule;
    await methods.createScheduleWithSlot(scheduleData({ user }), 2);
    expect(await methods.createScheduleWithSlot(scheduleData({ user }), 2)).toBe('limit');
    await methods.deleteScheduleById(a.id, user);
    const c = await methods.createScheduleWithSlot(scheduleData({ user }), 2);
    expect(c).not.toBe('limit');
    expect(await methods.countSchedulesByUser(user)).toBe(2);
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

  it('clearConversationId erases the reserved id so replays cannot restore a dead link', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor, conversationId: 'reserved-but-never-created' }),
    );

    // Pre-start abort: an id was reserved but no conversation ever came to exist.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'interrupted',
      clearConversationId: true,
      autoDisableAfterFailures: 3,
    });

    const run = await getRun(schedule.id, scheduledFor);
    expect(run.conversationId).toBeUndefined();
    const updated = await getSchedule(schedule.id);
    expect(updated.lastRun?.conversationId).toBeUndefined();

    // The crash-retry replay reads the ROW; with the id erased it has nothing
    // to project, so the dead link cannot be restored.
    await ScheduleRun.updateOne(
      { scheduleId: schedule.id, scheduledFor },
      { $set: { bookkept: false } },
    );
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'interrupted',
      conversationId: run.conversationId,
      autoDisableAfterFailures: 3,
    });
    const replayed = await getSchedule(schedule.id);
    expect(replayed.lastRun?.conversationId).toBeUndefined();
  });

  it('re-affirmed pauses keep the ORIGINAL fire time and do not churn updatedAt', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const originalFiredAt = new Date('2026-07-20T12:00:02Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor, firedAt: originalFiredAt }));
    const pause = () =>
      methods.recordRunOutcome({
        scheduleId: schedule.id,
        scheduledFor,
        status: 'requires_action',
        conversationId: 'convo-paused',
        autoDisableAfterFailures: 3,
      });

    await pause();
    const afterFirst = await getSchedule(schedule.id);
    // Reconciliation re-affirms a long-lived pause every pass; a fresh stamp per
    // pass walked the card's timestamp forward and reordered updated-time listings
    // for as long as the approval sat waiting.
    await pause();
    const afterSecond = await getSchedule(schedule.id);

    expect(afterSecond.lastRun?.firedAt?.toISOString()).toBe(originalFiredAt.toISOString());
    expect(afterSecond.updatedAt?.toISOString()).toBe(afterFirst.updatedAt?.toISOString());
  });

  it('does not write a pause card when no active run matches (spoof guard)', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    // No run row for this occurrence: the card is written only after a matching active
    // run is confirmed, so a spoofed scheduleId can never stamp a pause onto a schedule.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-spoof',
      autoDisableAfterFailures: 3,
    });
    const updated = await getSchedule(schedule.id);
    expect(updated.lastRun).toBeUndefined();
  });

  it('re-affirms the pause card on a retried requires_action (already-paused row)', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    });
    // The row is already `requires_action`; a crash-replay retry must still write the
    // card (keyed on existence, not modification) so the pause never goes invisible.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-2',
      autoDisableAfterFailures: 3,
    });
    const run = await getRun(schedule.id, scheduledFor);
    expect(run.status).toBe('requires_action');
    const updated = await getSchedule(schedule.id);
    expect(updated.lastRun?.status).toBe('requires_action');
    expect(updated.lastRun?.conversationId).toBe('convo-2');
  });

  it('does not pin the card to Needs approval when a resume terminalizes first', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    // The user answers instantly: the resumed generation settles the run BEFORE the
    // pause write lands. The pause must lose, or the card shows "Needs approval" for a
    // job that already finished (the run row is terminal, so nothing corrects it).
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    });

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    });

    const run = await getRun(schedule.id, scheduledFor);
    expect(run.status).toBe('success');
    const updated = await getSchedule(schedule.id);
    expect(updated.lastRun?.status).toBe('success');
  });

  it('does not let a delayed older outcome overwrite a newer run on the card', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const older = new Date('2026-07-26T10:00:00.000Z');
    const newer = new Date('2026-07-26T11:00:00.000Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor: older }));
    // Pausing the older occurrence is what frees the single-active-`started` slot and
    // lets a later occurrence run at all — the interleaving under test.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'requires_action',
      conversationId: 'convo-older',
      autoDisableAfterFailures: 3,
    });
    await methods.insertScheduleRun(runData(schedule, { scheduledFor: newer }));

    // The newer run finishes while the older one is still parked at its approval.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: newer,
      status: 'success',
      conversationId: 'convo-newer',
      autoDisableAfterFailures: 3,
    });
    // The older one settles afterwards (resumed pause / reconciler replay).
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'error',
      error: 'stale',
      conversationId: 'convo-older',
      autoDisableAfterFailures: 3,
    });

    const updated = await getSchedule(schedule.id);
    expect(updated.lastRun?.status).toBe('success');
    expect(updated.lastRun?.conversationId).toBe('convo-newer');
    // The streak counters are order-fenced too, not just the card. This assertion used
    // to expect 1 on the reasoning that counters are order-insensitive — but a streak
    // is not: letting the stale failure land rebuilds one the newer success had
    // cleared, and at `autoDisableAfterFailures: 1` that alone disables the schedule.
    expect(updated.failureCount).toBe(0);
    // The row still settles; only the schedule-level streak ignores the late outcome.
    expect(await getRun(schedule.id, older)).toMatchObject({ status: 'error' });
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

  it('is retryable: a duplicate skipped_balance occurrence does not double-count the streak', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-20T12:00:00Z');
    const data = {
      scheduleId: schedule.id,
      user: schedule.user,
      scheduledFor,
      status: 'skipped_balance' as const,
    };
    // First attempt inserts the row + increments the streak.
    await methods.recordSkippedRun(data, 3);
    // Retry of the SAME occurrence (a crash before the counter landed on the first
    // try): the row already exists, but the bookkeeping must still run — exactly once.
    await methods.recordSkippedRun(data, 3);
    const updated = await getSchedule(schedule.id);
    expect(updated.balanceSkipCount).toBe(1);
    expect(updated.lastRun?.status).toBe('skipped_balance');
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
    expect(
      (updated as { countedFor?: Date[] }).countedFor?.map((d) => new Date(d).toISOString()),
    ).toContain(scheduledFor.toISOString());
    expect((await getRun(schedule.id, scheduledFor)).bookkept).toBe(true);
  });

  it('does not double-count a crashed later occurrence when an earlier one interleaves', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const t1 = new Date('2026-07-20T10:00:00Z');
    const t2 = new Date('2026-07-20T11:00:00Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor: t1 }));
    await methods.insertScheduleRun(runData(schedule, { scheduledFor: t2 }));

    // Later occurrence B (t2) finishes + counts, then crashes before bookkept:true.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: t2,
      status: 'success',
      autoDisableAfterFailures: 3,
    });
    await ScheduleRun.updateOne(
      { scheduleId: schedule.id, scheduledFor: t2 },
      { $set: { bookkept: false } },
    );

    // Earlier occurrence A (t1) then counts — a single scalar guard would move to
    // t1 here, so replaying B would look uncounted again.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: t1,
      status: 'success',
      autoDisableAfterFailures: 3,
    });

    // Reconciler replays the still-unbookkept B: the per-occurrence guard blocks a re-count.
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor: t2,
      status: 'success',
      autoDisableAfterFailures: 3,
    });

    const updated = await getSchedule(schedule.id);
    expect(updated.runCount).toBe(2); // A + B, each counted exactly once
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

  it('rotates the unbookkept window past rows whose replay keeps failing', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const early = new Date('2026-07-20T10:00:00Z');
    const late = new Date('2026-07-20T11:00:00Z');
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: early, firedAt: early, status: 'success' }),
    );
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: late, firedAt: late, status: 'success' }),
    );
    await ScheduleRun.updateMany({ scheduleId: schedule.id }, { $set: { bookkept: false } });

    const cutoff = new Date(Date.now() + 1000);
    const first = await methods.getUnbookkeptRuns(cutoff, 1);
    expect(first).toHaveLength(1);
    expect(new Date(first[0].firedAt!).toISOString()).toBe(early.toISOString());

    // The engine stamps every row it attempted (success or failure); the next
    // bounded read must then surface the row BEHIND it, not the same one again.
    await methods.markRunsReconciled(first);
    const second = await methods.getUnbookkeptRuns(cutoff, 1);
    expect(new Date(second[0].firedAt!).toISOString()).toBe(late.toISOString());
  });

  it('replayed bookkeeping projects the ORIGINAL firedAt, not the replay time', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const originalFiredAt = new Date('2026-07-20T12:00:03Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor, firedAt: originalFiredAt }));
    await ScheduleRun.updateOne(
      { scheduleId: schedule.id, scheduledFor },
      { $set: { status: 'success', bookkept: false } },
    );

    // The reconciler replays minutes (or several retries) later — lastRun must
    // still show when the run actually fired, not when recovery caught up.
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      autoDisableAfterFailures: 3,
    });

    const updated = await getSchedule(schedule.id);
    expect(updated.lastRun?.firedAt?.toISOString()).toBe(originalFiredAt.toISOString());
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
    // Simulate a crash where the count landed (countedFor set) but the disable
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
    // Returns the fresh claim token (truthy) rather than a boolean.
    expect(reacquired).toBeTruthy();
  });

  it('returns the FRESH row (reflecting an edit) with a new claim token', async () => {
    const schedule = await methods.createSchedule(scheduleData({ name: 'original' }));
    // An edit commits after a caller read the schedule but before the lease is taken.
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'edited' });
    const leased = await methods.acquireManualRunLease(schedule.id, schedule.user, 60_000);
    // The lease returns the post-image, so a manual fire uses the edited snapshot.
    expect(leased?.name).toBe('edited');
    expect(leased?.claimToken).toBeTruthy();
  });

  it('blocks against a held engine lease and rejects a non-owner', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const claimed = await methods.claimDueSchedule({ instanceId: 'engine-1', leaseMs: 60_000 });
    expect(claimed?.id).toBe(schedule.id);
    expect(await methods.acquireManualRunLease(schedule.id, schedule.user, 60_000)).toBeNull();
    expect(
      await methods.acquireManualRunLease(schedule.id, new mongoose.Types.ObjectId(), 60_000),
    ).toBeNull();
  });

  it('uses a unique per-lease holder so a stale run-now cannot strip a replacement lease', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const first = await methods.acquireManualRunLease(schedule.id, schedule.user, 60_000);
    expect(first?.leaseBy).toMatch(/^manual:/);
    // Release and re-acquire (a fresh run-now): the replacement lease has a DIFFERENT holder.
    await methods.releaseLease(schedule.id);
    const second = await methods.acquireManualRunLease(schedule.id, schedule.user, 60_000);
    expect(second?.leaseBy).toMatch(/^manual:/);
    expect(second?.leaseBy).not.toBe(first?.leaseBy);
    // A stalled fire from the FIRST lease releasing by its (old) holder must NOT clear the
    // second lease — the unique holder makes releaseLeaseByHolder no-op there.
    await methods.releaseLeaseByHolder(schedule.id, first!.leaseBy!);
    const afterStale = await getSchedule(schedule.id);
    expect(afterStale.leaseBy).toBe(second?.leaseBy);
    expect(afterStale.leaseUntil).toBeDefined();
    // Releasing by the CURRENT holder does clear it.
    await methods.releaseLeaseByHolder(schedule.id, second!.leaseBy!);
    const cleared = await getSchedule(schedule.id);
    expect(cleared.leaseBy).toBeUndefined();
  });
});

describe('claim-token fencing (stale worker cannot mutate an edited/deleted schedule)', () => {
  it('an owner edit rotates the token so a stale disable/advance no-ops and revalidate fails', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const claim = await methods.claimDueSchedule({ instanceId: 'w1', leaseMs: 60_000 });
    const staleToken = claim!.claimToken!;
    expect(staleToken).toBeTruthy();
    // The stale worker still holds a valid claim until the owner edits.
    expect(await methods.revalidateClaim(schedule.id, staleToken)).toBe(true);

    // Owner edits (re-enable / rename) — updateScheduleById rotates the claim token.
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'renamed' });

    // The stale worker's fenced writes now match nothing.
    await methods.disableSchedule(schedule.id, 'too_many_failures', staleToken);
    await methods.advanceSchedule(
      schedule.id,
      new Date('2030-01-01T00:00:00Z'),
      claim!.nextRunAt,
      staleToken,
    );
    const after = await methods.getScheduleById(schedule.id);
    expect(after!.enabled).toBe(true); // stale disable no-op'd
    expect(after!.disabledReason).toBeUndefined();
    expect(after!.nextRunAt?.getTime()).toBe(claim!.nextRunAt?.getTime()); // stale advance no-op'd
    expect(await methods.revalidateClaim(schedule.id, staleToken)).toBe(false);
  });

  it('revalidateClaim fails once the lease expires (a re-claim could be imminent)', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const claim = await methods.claimDueSchedule({ instanceId: 'w1', leaseMs: -1 }); // already expired
    expect(await methods.revalidateClaim(schedule.id, claim!.claimToken!)).toBe(false);
  });
});

describe('deletion barrier fails closed on cache invalidation', () => {
  const CACHE_MODE = process.env.AUTH_USER_CACHE_MODE;

  afterEach(() => {
    if (CACHE_MODE === undefined) {
      delete process.env.AUTH_USER_CACHE_MODE;
    } else {
      process.env.AUTH_USER_CACHE_MODE = CACHE_MODE;
    }
  });

  /**
   * The barrier is only real once no cached PRE-barrier user document can still
   * populate req.user. Swallowing the invalidation fault reports a barrier that was
   * never raised, and the caller then starts the destructive cascade while stale
   * requests are still admitted.
   */
  it('throws when the cached user document cannot be invalidated', async () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    const failing = createUserMethods(mongoose, {
      getCache: () =>
        ({
          get: async () => {
            throw new Error('redis down');
          },
          delete: async () => undefined,
        }) as never,
    });
    const user = await mongoose.models.User.create({
      email: `barrier-fail-${Date.now()}@test.dev`,
      name: 'B',
    });

    await expect(failing.markUserDeleting(user._id.toString())).rejects.toThrow(/redis down/);
  });

  it('throws when the cache is enabled but unavailable', async () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    const noCache = createUserMethods(mongoose, { getCache: () => undefined });
    const user = await mongoose.models.User.create({
      email: `barrier-nocache-${Date.now()}@test.dev`,
      name: 'B',
    });

    await expect(noCache.markUserDeleting(user._id.toString())).rejects.toThrow(/cannot confirm/i);
  });

  it('succeeds normally when the cache is disabled', async () => {
    delete process.env.AUTH_USER_CACHE_MODE;
    const user = await mongoose.models.User.create({
      email: `barrier-ok-${Date.now()}@test.dev`,
      name: 'B',
    });
    await expect(userMethods.markUserDeleting(user._id.toString())).resolves.toBeInstanceOf(Date);
  });

  it('writes the deletion tombstone BEFORE sweeping the cached keys', async () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    const ops: string[] = [];
    const tracking = createUserMethods(mongoose, {
      getCache: () =>
        ({
          get: async () => undefined,
          set: async (key: string) => {
            ops.push(`set:${key}`);
            return true;
          },
          delete: async (key: string) => {
            ops.push(`delete:${key}`);
            return true;
          },
        }) as never,
    });
    const user = await mongoose.models.User.create({
      email: `barrier-tombstone-${Date.now()}@test.dev`,
      name: 'B',
    });

    await tracking.markUserDeleting(user._id.toString());

    // A fill racing this barrier checks the tombstone AFTER its own write. That
    // only closes the race if the tombstone exists before the sweep begins: a
    // sweep-first ordering leaves a window where the fill sees no tombstone and
    // its entry was written after the sweep — surviving for the full TTL.
    const tombstoneSet = ops.findIndex((op) => op.startsWith('set:auth-user-doc-tombstone:'));
    const firstDelete = ops.findIndex((op) => op.startsWith('delete:'));
    expect(tombstoneSet).toBeGreaterThanOrEqual(0);
    expect(firstDelete).toBeGreaterThan(tombstoneSet);
  });

  it('establishes the cache tombstone BEFORE the durable deletion stamp', async () => {
    process.env.AUTH_USER_CACHE_MODE = 'on';
    const user = await mongoose.models.User.create({
      email: `barrier-order-${Date.now()}@test.dev`,
      name: 'B',
    });
    let stampAtTombstoneWrite: unknown = 'unchecked';
    const tracking = createUserMethods(mongoose, {
      getCache: () =>
        ({
          get: async () => undefined,
          set: async (key: string) => {
            if (key.startsWith('auth-user-doc-tombstone:')) {
              const doc = await mongoose.models.User.findById(user._id)
                .select('deletionRequestedAt')
                .lean<{ deletionRequestedAt?: Date }>();
              stampAtTombstoneWrite = doc?.deletionRequestedAt ?? null;
            }
            return true;
          },
          delete: async () => true,
        }) as never,
    });

    await tracking.markUserDeleting(user._id.toString());

    // A cached hit treats an ABSENT tombstone as a conclusive fence, so the
    // tombstone must exist before the deletion becomes durable: a stamp-first
    // ordering left a window where a hit between the two writes authenticated a
    // user whose deletion had already durably begun — possibly after the quiesce
    // pass that would have discovered that request's work.
    expect(stampAtTombstoneWrite).toBeNull();
    const after = await mongoose.models.User.findById(user._id)
      .select('deletionRequestedAt')
      .lean<{ deletionRequestedAt?: Date }>();
    expect(after?.deletionRequestedAt).toBeInstanceOf(Date);
  });
});

describe('schedule deletion is retryable', () => {
  /**
   * The mark is the FIRST of several teardown steps (read active runs, abort their
   * jobs, prune checkpoints, erase when drained). A one-shot mark made every retry
   * answer 404 after any of those threw, stranding the schedule with its job and
   * checkpoint alive until the background expiry windows.
   */
  it('re-marks an already-deleting schedule so the caller can re-drive teardown', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const first = await methods.markScheduleDeleting(schedule.id, schedule.user);
    expect(first).not.toBeNull();

    const retry = await methods.markScheduleDeleting(schedule.id, schedule.user);
    expect(retry).not.toBeNull();
    expect(retry!.deleting).toBe(true);
    expect(retry!.enabled).toBe(false);
    // The token rotates again, which only re-fences stale workers.
    expect(retry!.claimToken).not.toBe(first!.claimToken);
  });

  it('still refuses a schedule owned by someone else', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const other = new mongoose.Types.ObjectId();
    expect(await methods.markScheduleDeleting(schedule.id, other)).toBeNull();
  });
});

describe('unarmed-schedule recovery', () => {
  /**
   * Creation arms in a second write, so a crash or a failed arm leaves a row that looks
   * enabled to its owner and occupies a slot while claimDueSchedule — which sorts on
   * nextRunAt — can never select it.
   */
  it('finds enabled schedules with no nextRunAt and arms them', async () => {
    const schedule = await methods.createSchedule({ ...scheduleData(), nextRunAt: undefined });
    expect((await getSchedule(schedule.id)).nextRunAt).toBeUndefined();

    const unarmed = await methods.getUnarmedSchedules(10);
    expect(unarmed.map((s) => s.id)).toContain(schedule.id);

    const when = new Date('2030-01-01T00:00:00.000Z');
    await methods.armSchedule(schedule.id, when);
    expect((await getSchedule(schedule.id)).nextRunAt?.getTime()).toBe(when.getTime());
    // Now armed, so it drops out of the sweep.
    expect((await methods.getUnarmedSchedules(10)).map((s) => s.id)).not.toContain(schedule.id);
  });

  it('never disturbs a schedule that armed itself in the meantime', async () => {
    const schedule = await methods.createSchedule({ ...scheduleData(), nextRunAt: undefined });
    const real = new Date('2030-06-01T00:00:00.000Z');
    await methods.armSchedule(schedule.id, real);

    // A concurrent sweep pass computed its own value from a stale read.
    await methods.armSchedule(schedule.id, new Date('2030-01-01T00:00:00.000Z'));

    expect((await getSchedule(schedule.id)).nextRunAt?.getTime()).toBe(real.getTime());
  });

  it('excludes disabled and deleting schedules from the sweep', async () => {
    const disabled = await methods.createSchedule({
      ...scheduleData(),
      nextRunAt: undefined,
      enabled: false,
    });
    const deleting = await methods.createSchedule({ ...scheduleData(), nextRunAt: undefined });
    await methods.markScheduleDeleting(deleting.id, deleting.user);

    const ids = (await methods.getUnarmedSchedules(10)).map((s) => s.id);
    expect(ids).not.toContain(disabled.id);
    expect(ids).not.toContain(deleting.id);
  });
});

describe('card projection fences (regressions in the ordered projection)', () => {
  /**
   * The terminal path passes the row's revision to projectLastRun; the pause path did
   * not. An owner edit landing between fire and approval therefore got the OLD config's
   * pause stamped on it, and because the later terminal write IS revision-fenced it
   * could never replace that status — the card stuck on "Needs approval".
   */
  it('does not stamp a pause onto a schedule edited after the run started', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T10:00:00.000Z');
    const runRevision = (await getSchedule(schedule.id)).configRevision;
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor, configRevision: runRevision }),
    );
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'renamed' });

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    });

    // The row still pauses (the generation really is waiting) but the edited
    // schedule's card is not stamped by the superseded config.
    expect(await getRun(schedule.id, scheduledFor)).toMatchObject({ status: 'requires_action' });
    expect((await getSchedule(schedule.id)).lastRun).toBeUndefined();
  });

  /**
   * A skip wrote `lastRun` directly, dropping the `scheduledFor` ordering marker that
   * projectLastRun keys off — so the NEXT projection saw an absent marker and let an
   * older occurrence's result overwrite the newer skip.
   */
  /**
   * The pause wins its row transition and THEN projects, so a resume that terminalizes
   * in between leaves exactly this state: row still active, card already settled for the
   * SAME occurrence. Occurrence ordering alone permits the pause (equal `scheduledFor`),
   * which would pin the card to "Needs approval" for a run that had already finished —
   * and nothing corrects it until the next occurrence runs.
   *
   * The interleaving needs two concurrent writers, but the state it produces does not:
   * constructing it directly tests the guard on exactly the input it exists for.
   */
  it('refuses to walk an occurrence card back from a settled status to a pause', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T10:00:00.000Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));
    // The resumed generation already settled this occurrence's card.
    await mongoose.models.Schedule.updateOne(
      { id: schedule.id },
      {
        $set: {
          lastRun: {
            status: 'success',
            firedAt: new Date(),
            scheduledFor,
            conversationId: 'convo-1',
          },
        },
      },
    );

    // The in-flight pause now lands for that same occurrence.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    });

    expect((await getSchedule(schedule.id)).lastRun?.status).toBe('success');
  });

  it('still projects a pause when the occurrence card is not yet settled', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T10:00:00.000Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'requires_action',
      conversationId: 'convo-1',
      autoDisableAfterFailures: 3,
    });

    expect((await getSchedule(schedule.id)).lastRun?.status).toBe('requires_action');
  });

  it('keeps the occurrence marker when recording a skip', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const older = new Date('2026-07-26T10:00:00.000Z');
    const newer = new Date('2026-07-26T11:00:00.000Z');
    await methods.insertScheduleRun(runData(schedule, { scheduledFor: older }));
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'requires_action',
      conversationId: 'convo-older',
      autoDisableAfterFailures: 3,
    });

    // The newer occurrence is skipped for balance while the older one sits paused.
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        scheduledFor: newer,
        user: schedule.user,
        status: 'skipped_balance',
        firedAt: new Date(),
      },
      5,
    );
    expect((await getSchedule(schedule.id)).lastRun?.status).toBe('skipped_balance');

    // The older occurrence then resumes and finishes. It must NOT roll the card back.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'success',
      conversationId: 'convo-older',
      autoDisableAfterFailures: 3,
    });

    expect((await getSchedule(schedule.id)).lastRun?.status).toBe('skipped_balance');
  });
});

describe('auto-disable carries the run config generation', () => {
  /**
   * The auto-disable policy re-reads the schedule and then writes, so the decision and
   * the write are not atomic. Carrying the run's config generation on the write closes
   * that window: an owner edit landing inside it rotates configRevision, and the stale
   * decision no longer applies.
   *
   * NOTE the ordinary re-enable path is NOT this scenario — `updateSchedule` zeroes
   * failureCount/balanceSkipCount when re-enabling, so a re-enabled schedule cannot be
   * sitting at the threshold. The state below is reached only through the read→write
   * window itself, which is why it is constructed directly.
   */
  it('does not disable when the run config generation is stale', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const runRevision = (await getSchedule(schedule.id)).configRevision;
    // A plain rename — NOT a re-enable, so the counters are deliberately left alone.
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'renamed' });
    expect((await getSchedule(schedule.id)).configRevision).toBeGreaterThan(runRevision!);
    // At threshold and still enabled: what a decision made just before that edit saw.
    await mongoose.models.Schedule.updateOne({ id: schedule.id }, { $set: { failureCount: 5 } });

    const stale = new Date('2026-07-26T11:00:00.000Z');
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor: stale, configRevision: runRevision }),
    );
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: stale,
      status: 'error',
      error: 'stale decision',
      autoDisableAfterFailures: 1,
    });

    expect((await getSchedule(schedule.id)).enabled).toBe(true);
  });

  /**
   * The threshold read and the disable write are separate statements. A concurrent
   * success resets the failure streak in between, so a revision-only fence would still
   * let the stale decision disable a schedule whose streak had just been cleared.
   */
  it('does not disable once a concurrent success reset the failure streak', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const current = await getSchedule(schedule.id);
    await mongoose.models.Schedule.updateOne({ id: schedule.id }, { $set: { failureCount: 5 } });

    // The decision was made on failureCount >= 5; a success then zeroed it.
    await mongoose.models.Schedule.updateOne({ id: schedule.id }, { $set: { failureCount: 0 } });
    await methods.disableSchedule(
      schedule.id,
      'too_many_failures',
      undefined,
      current.configRevision,
      {
        failureCount: { $gte: 5 },
      },
    );

    expect((await getSchedule(schedule.id)).enabled).toBe(true);
  });

  it('still disables when the streak is intact', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const current = await getSchedule(schedule.id);
    await mongoose.models.Schedule.updateOne({ id: schedule.id }, { $set: { failureCount: 5 } });

    await methods.disableSchedule(
      schedule.id,
      'too_many_failures',
      undefined,
      current.configRevision,
      {
        failureCount: { $gte: 5 },
      },
    );

    expect(await getSchedule(schedule.id)).toMatchObject({
      enabled: false,
      disabledReason: 'too_many_failures',
    });
  });

  it('still auto-disables when the run matches the current config generation', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T10:00:00.000Z');
    const current = await getSchedule(schedule.id);
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor, configRevision: current.configRevision }),
    );

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      error: 'boom',
      autoDisableAfterFailures: 1,
    });

    expect(await getSchedule(schedule.id)).toMatchObject({
      enabled: false,
      disabledReason: 'too_many_failures',
    });
  });
});

describe('reserveStartedRun duplicate reporting', () => {
  /**
   * The caller has to tell "another worker is still running this" from "this occurrence
   * already finished and was merely never advanced past" — they need opposite handling,
   * and a bare `duplicate` cannot distinguish them.
   */
  it('reports the existing row status on a duplicate', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T10:00:00.000Z');
    const base = {
      scheduleId: schedule.id,
      scheduledFor,
      user: schedule.user,
      firedAt: new Date(),
    };
    await methods.reserveStartedRun({ ...base, conversationId: 'first' });

    const active = await methods.reserveStartedRun({ ...base, conversationId: 'second' });
    expect(active).toMatchObject({ conflict: 'duplicate', existingStatus: 'started' });

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      autoDisableAfterFailures: 3,
    });

    const settled = await methods.reserveStartedRun({ ...base, conversationId: 'third' });
    expect(settled).toMatchObject({ conflict: 'duplicate', existingStatus: 'success' });
  });
});

describe('deleteScheduleRun conversation fence', () => {
  it('deletes only the reservation the caller inserted', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T12:00:00.000Z');
    await methods.reserveStartedRun({
      scheduleId: schedule.id,
      scheduledFor,
      user: schedule.user,
      conversationId: 'conv-mine',
      firedAt: new Date(),
    });

    // Another fire's id must not match: this is what makes the rollback safe without
    // consulting lease ownership, which the preflight can outlive.
    await methods.deleteScheduleRun(schedule.id, scheduledFor, 'started', 'conv-theirs');
    expect(await methods.getActiveRunsForSchedule(schedule.id)).toHaveLength(1);

    await methods.deleteScheduleRun(schedule.id, scheduledFor, 'started', 'conv-mine');
    expect(await methods.getActiveRunsForSchedule(schedule.id)).toHaveLength(0);
  });

  it('still honors the status fence so a settled run is never rolled back', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const scheduledFor = new Date('2026-07-26T13:00:00.000Z');
    await methods.reserveStartedRun({
      scheduleId: schedule.id,
      scheduledFor,
      user: schedule.user,
      conversationId: 'conv-mine',
      firedAt: new Date(),
    });
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      autoDisableAfterFailures: 5,
    });

    await methods.deleteScheduleRun(schedule.id, scheduledFor, 'started', 'conv-mine');

    const runs = await methods.getRunsForReconciliation(new Date(Date.now() + 1000), 10);
    expect(runs).toHaveLength(0);
    expect(await methods.getScheduleById(schedule.id)).toMatchObject({
      lastRun: expect.objectContaining({ status: 'success' }),
    });
  });
});

describe('erasure leaves an idempotency tombstone', () => {
  it('retains the create key so a late retry cannot resurrect deleted work', async () => {
    const user = new mongoose.Types.ObjectId();
    const schedule = await methods.createSchedule(
      scheduleData({
        user,
        deleting: true,
        nextRunAt: undefined,
        clientRequestId: 'late-retry-key',
        clientRequestDigest: 'digest-1',
      }),
    );

    await expect(methods.eraseScheduleIfDrained(schedule.id)).resolves.toBe(true);

    // The content is gone, the identity is not: a create retry with this key must
    // resolve to the tombstone (the handler answers 410 on deleting rows) instead
    // of missing entirely and recreating the recurring work the owner deleted.
    const tombstone = await methods.getScheduleByClientRequestId(user, 'late-retry-key');
    expect(tombstone).not.toBeNull();
    expect(tombstone?.erased).toBe(true);
    expect(tombstone?.deleting).toBe(true);
    expect(tombstone?.clientRequestDigest).toBe('digest-1');
    // ALLOWLIST semantics: everything except the replay-detection identity is gone,
    // derived from the live schema paths so fields added later cannot leak either.
    const contentKeys = Object.keys(tombstone ?? {}).filter(
      (key) =>
        ![
          '_id',
          '__v',
          'id',
          'user',
          'tenantId',
          'clientRequestId',
          'clientRequestDigest',
          'deleting',
          'erased',
          'erasedAt',
          'enabled',
          'createdAt',
          'updatedAt',
        ].includes(key),
    );
    expect(contentKeys).toEqual([]);
    expect(tombstone?.prompt).toBeUndefined();
    expect(tombstone?.name).toBeUndefined();
    expect(tombstone?.cadence).toBeUndefined();
    expect(tombstone?.timezone).toBeUndefined();

    // Tombstones are inert to every sweep: re-erasing or re-deleting them forever
    // would pin the bounded windows.
    const sweepRows = await methods.getDeletingSchedules(50);
    expect(sweepRows.some((row) => row.id === schedule.id)).toBe(false);
    const retryIds = await methods.getDeletingScheduleIds(user, 50);
    expect(retryIds).not.toContain(schedule.id);
  });

  it('hard-deletes rows that never carried a create key', async () => {
    const user = new mongoose.Types.ObjectId();
    const schedule = await methods.createSchedule(
      scheduleData({ user, deleting: true, nextRunAt: undefined }),
    );

    await expect(methods.eraseScheduleIfDrained(schedule.id)).resolves.toBe(true);
    const gone = await mongoose.models.Schedule.findOne({ id: schedule.id }).lean();
    expect(gone).toBeNull();
  });
});

describe('deletion quiescing (soft-delete, drain, erase)', () => {
  it('markScheduleDeleting hides + un-claims; erase waits for active runs to drain', async () => {
    const schedule = await methods.createScheduleWithSlot(scheduleData(), 10);
    const sched = schedule as ISchedule;
    const when = new Date('2026-07-20T12:00:00Z');
    await methods.reserveStartedRun(runData(sched, { scheduledFor: when }));

    const marked = await methods.markScheduleDeleting(sched.id, sched.user);
    expect(marked!.deleting).toBe(true);
    expect(marked!.enabled).toBe(false);
    // Hidden from the owner and no longer claimable by the engine.
    expect(await methods.getSchedulesByUser(sched.user)).toHaveLength(0);
    expect(await methods.claimDueSchedule({ instanceId: 'w1', leaseMs: 60_000 })).toBeNull();

    // Erase is blocked while a run is still active (evidence preserved). The raw
    // doc still exists (getScheduleById hides `deleting` schedules by design).
    expect(await methods.eraseScheduleIfDrained(sched.id)).toBe(false);
    expect(await Schedule.findOne({ id: sched.id }).lean()).not.toBeNull();

    // Once the run terminalizes, the schedule and its runs erase.
    await ScheduleRun.updateOne(
      { scheduleId: sched.id, scheduledFor: when },
      { $set: { status: 'interrupted' } },
    );
    expect(await methods.eraseScheduleIfDrained(sched.id)).toBe(true);
    expect(await Schedule.findOne({ id: sched.id }).lean()).toBeNull();
    expect(await ScheduleRun.countDocuments({ scheduleId: sched.id })).toBe(0);
    // Its slot is freed for reuse.
    const replacement = await methods.createScheduleWithSlot(
      scheduleData({ user: sched.user }),
      10,
    );
    expect(replacement).not.toBe('limit');
  });

  it('a deleting schedule is hidden, non-mutable, and non-claimable (no re-enable)', async () => {
    const schedule = await methods.createScheduleWithSlot(scheduleData(), 10);
    const sched = schedule as ISchedule;
    await methods.markScheduleDeleting(sched.id, sched.user);
    // Hidden and unreadable through the owner-facing read.
    expect(await methods.getScheduleById(sched.id)).toBeNull();
    expect(await methods.getScheduleById(sched.id, sched.user)).toBeNull();
    // A stale/concurrent re-enable PATCH is refused (returns null -> handler 404).
    const reEnabled = await methods.updateScheduleById(sched.id, sched.user, {
      enabled: true,
      nextRunAt: new Date(Date.now() - 60_000),
    });
    expect(reEnabled).toBeNull();
    // Even if a nextRunAt/enabled somehow lingered, the engine won't claim it.
    expect(await methods.claimDueSchedule({ instanceId: 'w1', leaseMs: 60_000 })).toBeNull();
  });

  it('keeps a live lease and does not erase until it is released (worker mid-claim)', async () => {
    const schedule = await methods.createScheduleWithSlot(scheduleData(), 10);
    const sched = schedule as ISchedule;
    // A worker has CLAIMED the schedule (live lease) but not yet inserted a run row.
    const claim = await methods.claimDueSchedule({ instanceId: 'w1', leaseMs: 60_000 });
    expect(claim?.id).toBe(sched.id);
    const marked = await methods.markScheduleDeleting(sched.id, sched.user);
    // The lease is PRESERVED so the worker can prove ownership on its rollback.
    expect(marked?.leaseBy).toBe('w1');
    // Erase is blocked while the lease is live, even with no active run row.
    expect(await methods.eraseScheduleIfDrained(sched.id)).toBe(false);
    expect(await Schedule.findOne({ id: sched.id }).lean()).not.toBeNull();
    // Once the worker releases its own lease (by holder), it drains and erases.
    await methods.releaseLeaseByHolder(sched.id, 'w1');
    expect(await methods.eraseScheduleIfDrained(sched.id)).toBe(true);
    expect(await Schedule.findOne({ id: sched.id }).lean()).toBeNull();
  });

  it('frees the slot immediately on soft-delete so a new create can take it under the cap', async () => {
    const user = new mongoose.Types.ObjectId();
    const a = (await methods.createScheduleWithSlot(scheduleData({ user }), 1)) as ISchedule;
    expect(await methods.createScheduleWithSlot(scheduleData({ user }), 1)).toBe('limit');
    await methods.markScheduleDeleting(a.id, user);
    // The deleting schedule no longer occupies the cap, so a replacement fits.
    const b = await methods.createScheduleWithSlot(scheduleData({ user }), 1);
    expect(b).not.toBe('limit');
  });
});

describe('account-deletion barrier (delete vs create)', () => {
  it('is one-way and monotonic under concurrent deletion requests', async () => {
    const User = mongoose.models.User;
    const user = await User.create({ email: `barrier-${Date.now()}@test.dev`, name: 'B' });

    expect(await userMethods.isUserDeleting(user._id.toString())).toBe(false);

    // Six concurrent deletion requests must agree on ONE timestamp: the barrier is
    // stamped only when absent, so there is no un-delete race and no ABA window.
    const stamps = await Promise.all(
      Array.from({ length: 6 }, () => userMethods.markUserDeleting(user._id.toString())),
    );
    const unique = new Set(stamps.map((d) => d?.getTime()));
    expect(unique.size).toBe(1);
    expect(await userMethods.isUserDeleting(user._id.toString())).toBe(true);
  });

  it('fails CLOSED for an unknown user so admission never leaks', async () => {
    // Refusing work for a live user is recoverable (the caller retries); admitting work
    // for a deleting one is not, so an unresolvable lookup must report "deleting".
    expect(await userMethods.isUserDeleting(new mongoose.Types.ObjectId().toString())).toBe(true);
  });

  it('surfaces unfinished COMMITTED cascades as a resumable work list', async () => {
    const User = mongoose.models.User;
    const pendingUser = await User.create({
      email: `pending-${Date.now()}@test.dev`,
      name: 'P',
    });
    await userMethods.markUserDeleting(pendingUser._id.toString());
    await userMethods.markUserDeletionCommitted(pendingUser._id.toString());

    // A deletion deferred on an unconfirmed quiesce (or crashed part-way) leaves the
    // barrier up with the document still present — exactly what a later pass queries.
    const pending = await userMethods.getUsersPendingDeletion(50);
    expect(pending.some((u) => u._id.toString() === pendingUser._id.toString())).toBe(true);
  });

  it('never surfaces a barrier the CLI raised without committing', async () => {
    const User = mongoose.models.User;
    const refusedUser = await User.create({
      email: `cli-refused-${Date.now()}@test.dev`,
      name: 'R',
    });
    // config/delete-user.js raises the admission barrier, then can REFUSE (active
    // runs) and exit. The sweep auto-completing that barrier would delete an account
    // — and transactions the operator chose to retain — after the CLI reported the
    // deletion as refused.
    await userMethods.markUserDeleting(refusedUser._id.toString());

    const pending = await userMethods.getUsersPendingDeletion(50);
    expect(pending.some((u) => u._id.toString() === refusedUser._id.toString())).toBe(false);
  });

  it('rotates the pending-deletion window past cascades that keep deferring', async () => {
    const User = mongoose.models.User;
    const suffix = Date.now();
    const first = await User.create({ email: `rot-a-${suffix}@test.dev`, name: 'A' });
    const second = await User.create({ email: `rot-b-${suffix}@test.dev`, name: 'B' });
    await userMethods.markUserDeleting(first._id.toString());
    await userMethods.markUserDeletionCommitted(first._id.toString());
    await userMethods.markUserDeleting(second._id.toString());
    await userMethods.markUserDeletionCommitted(second._id.toString());

    const window = await userMethods.getUsersPendingDeletion(1);
    expect(window).toHaveLength(1);
    await userMethods.markDeletionSweepAttempted([window[0]._id.toString()]);

    // Same rotation discipline as every other bounded recovery window: a quiesce
    // that keeps deferring must not pin the window and starve deletions behind it.
    const rotated = await userMethods.getUsersPendingDeletion(1);
    expect(rotated[0]._id.toString()).not.toBe(window[0]._id.toString());
  });
});

describe('config fence is DERIVED at the seam, not passed by callers', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('skips bookkeeping when the owner edited the schedule after the run started', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    // The run captured the config generation it started under.
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor, configRevision: schedule.configRevision ?? 0 }),
    );
    // Owner edits -> configRevision moves on.
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'edited' });

    // NOTE: no fence token is passed — recordRunOutcome derives it from the run row.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      error: 'boom',
      autoDisableAfterFailures: 3,
    });

    // The run still terminalizes (evidence is preserved)...
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('error');
    // ...but it must NOT count a failure against the schedule the owner just edited.
    const after = await getSchedule(schedule.id);
    expect(after.failureCount).toBe(0);
    expect(after.lastRun).toBeUndefined();
  });

  it('applies bookkeeping normally when the revision still matches', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(
      runData(schedule, { scheduledFor, configRevision: schedule.configRevision ?? 0 }),
    );
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'success',
      conversationId: 'c1',
      autoDisableAfterFailures: 3,
    });
    const after = await getSchedule(schedule.id);
    expect(after.runCount).toBe(1);
    expect(after.lastRun?.status).toBe('success');
  });

  it('fences the crash-retry path (finalizeBookkeeping) the same way', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.insertScheduleRun(
      runData(schedule, {
        scheduledFor,
        status: 'error',
        bookkept: false,
        configRevision: schedule.configRevision ?? 0,
      }),
    );
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'edited' });

    // The reconciler replays bookkeeping for an unbookkept run; it must honor the same
    // fence as the inline path, or a crash would let it apply what inline refused.
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'error',
      autoDisableAfterFailures: 3,
    });
    expect((await getSchedule(schedule.id)).failureCount).toBe(0);
  });
});

describe('skip bookkeeping is fenced by the same derived seam', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('does not stamp the card when the owner edited after the occurrence was claimed', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    // Owner edits AFTER the worker claimed at the old revision.
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'edited' });

    await methods.recordSkippedRun({
      scheduleId: schedule.id,
      user: schedule.user,
      scheduledFor,
      status: 'skipped_overlap',
      configRevision: schedule.configRevision ?? 0, // the CLAIMED revision, now stale
    });

    // The skip row still exists as evidence, but the schedule card is untouched.
    expect((await getRun(schedule.id, scheduledFor)).status).toBe('skipped_overlap');
    expect((await getSchedule(schedule.id)).lastRun).toBeUndefined();
  });

  it('stamps the card normally when the revision still matches', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.recordSkippedRun({
      scheduleId: schedule.id,
      user: schedule.user,
      scheduledFor,
      status: 'skipped_overlap',
      configRevision: schedule.configRevision ?? 0,
    });
    expect((await getSchedule(schedule.id)).lastRun?.status).toBe('skipped_overlap');
  });

  it('does not walk the balance streak toward auto-disable under a stale revision', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'edited' });
    await methods.recordSkippedRun(
      {
        scheduleId: schedule.id,
        user: schedule.user,
        scheduledFor,
        status: 'skipped_balance',
        configRevision: schedule.configRevision ?? 0,
      },
      1, // threshold of 1 would disable immediately if the fence did not hold
    );
    const after = await getSchedule(schedule.id);
    expect(after.balanceSkipCount).toBe(0);
    expect(after.enabled).toBe(true);
  });
});

describe('streak counters are order-fenced', () => {
  const older = new Date('2026-07-20T08:00:00Z');
  const newer = new Date('2026-07-20T09:00:00Z');

  /**
   * A `requires_action` run holds no capacity slot and does not block its schedule's
   * later occurrences, so an older occurrence routinely settles AFTER a newer one — a
   * resumed pause, or a reconciler replay. Unfenced, its late `error` rebuilds a streak
   * the newer success had cleared.
   */
  it('does not let an older failure rebuild a streak a newer success cleared', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule, { scheduledFor: older, status: 'requires_action' }));
    await ScheduleRun.create(runData(schedule, { scheduledFor: newer }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: newer,
      status: 'success',
      autoDisableAfterFailures: 5,
    });
    expect((await getSchedule(schedule.id)).failureCount).toBe(0);

    // The older occurrence settles late, in error.
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'error',
      error: 'late failure',
      autoDisableAfterFailures: 5,
    });

    const after = await getSchedule(schedule.id);
    expect(after.failureCount).toBe(0);
  });

  /**
   * `autoDisableAfterFailures` may be configured as low as 1, where a single stale
   * failure is the difference between a healthy schedule and a disabled one.
   */
  it('does not auto-disable a healthy schedule on a stale failure at threshold 1', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule, { scheduledFor: older, status: 'requires_action' }));
    await ScheduleRun.create(runData(schedule, { scheduledFor: newer }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: newer,
      status: 'success',
      autoDisableAfterFailures: 1,
    });
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'error',
      autoDisableAfterFailures: 1,
    });

    const after = await getSchedule(schedule.id);
    expect(after.enabled).toBe(true);
    expect(after.disabledReason).toBeUndefined();
  });

  it('still counts occurrences that settle in order', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    // The older row is `requires_action`: the single-active partial index admits only
    // one `started` run per schedule, which is exactly why pauses can pile up.
    await ScheduleRun.create(runData(schedule, { scheduledFor: older, status: 'requires_action' }));
    await ScheduleRun.create(runData(schedule, { scheduledFor: newer }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: older,
      status: 'error',
      autoDisableAfterFailures: 5,
    });
    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor: newer,
      status: 'error',
      autoDisableAfterFailures: 5,
    });

    expect((await getSchedule(schedule.id)).failureCount).toBe(2);
  });
});

describe('updateScheduleById revision fence', () => {
  it('refuses an edit computed from a superseded revision', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const staleRevision = schedule.configRevision ?? 0;
    // A concurrent edit lands first and moves the revision on.
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'winner' });

    const loser = await methods.updateScheduleById(
      schedule.id,
      schedule.user,
      { name: 'loser' },
      undefined,
      { expectedConfigRevision: staleRevision },
    );

    // Otherwise the loser would persist a nextRunAt derived from a (cadence, timezone)
    // pair that no longer describes the row.
    expect(loser).toBeNull();
    expect((await getSchedule(schedule.id)).name).toBe('winner');
  });

  it('applies an edit whose revision is still current', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const updated = await methods.updateScheduleById(
      schedule.id,
      schedule.user,
      { name: 'renamed' },
      undefined,
      { expectedConfigRevision: schedule.configRevision ?? 0 },
    );
    expect(updated?.name).toBe('renamed');
  });
});

describe('reconciliation rotates the paused window', () => {
  /**
   * Paused runs accumulate without bound (no capacity slot, no occurrence block) and
   * the approval TTL that ends them has no ceiling, so a full window of still-LIVE
   * pauses can sit at the front of an oldest-first ordering forever. Ordering by when
   * each row was last examined is what guarantees every row eventually gets a turn.
   */
  it('serves rows behind a full window once the leaders have been examined', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    const base = Date.parse('2026-07-01T00:00:00Z');
    const olderThan = new Date(base + 10_000_000);
    for (let i = 0; i < 100; i++) {
      await ScheduleRun.create(
        runData(schedule, {
          scheduledFor: new Date(base + i * 60_000),
          status: 'requires_action',
          firedAt: new Date(base + i * 60_000),
        }),
      );
    }
    // Newer than the 100 leaders, but still inside the age filter — the point is that
    // ORDERING keeps it out of the first window, not that it is too young to qualify.
    const queuedAt = new Date(base + 120 * 60_000);
    await ScheduleRun.create(
      runData(schedule, {
        scheduledFor: queuedAt,
        status: 'requires_action',
        firedAt: queuedAt,
      }),
    );

    const first = await methods.getRunsForReconciliation(olderThan, 100);
    // The newest row is behind a full batch, so this pass cannot reach it.
    expect(first.some((run) => run.scheduledFor?.getTime() === queuedAt.getTime())).toBe(false);

    // Examining the batch rotates it to the back.
    await methods.markRunsReconciled(first);

    const second = await methods.getRunsForReconciliation(olderThan, 100);
    expect(second.some((run) => run.scheduledFor?.getTime() === queuedAt.getTime())).toBe(true);
  });
});

describe('requestRunAbort (renewable, source-aware stamp)', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('renews freshness on a deletion retry without stealing an unresolved stop source', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule));

    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'stop')).toBe(true);
    const first = await methods.getScheduleRunAbortState(schedule.id, scheduledFor);
    expect(first?.abortRequestedAt).toBeInstanceOf(Date);
    expect(first?.abortSource).toBe('stop');

    // A racing deletion must not steal the source (the settlement barrier reads it to
    // know the Stop route still has writes in flight) but MUST renew the freshness
    // stamp — its abort is a new signal the fences have to cover.
    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'deletion')).toBe(true);
    const second = await methods.getScheduleRunAbortState(schedule.id, scheduledFor);
    expect(second?.abortSource).toBe('stop');
    expect(second?.abortRequestedAt!.getTime()).toBeGreaterThanOrEqual(
      first!.abortRequestedAt!.getTime(),
    );
  });

  it('lets a stop attempt take over a deletion-stamped run and re-open its persistence', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule));

    // Deletion stamps first; the user's Stop then wins the abort — the owner's
    // barrier must now wait on the ROUTE's persistence, so the stop takes the source.
    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'deletion')).toBe(true);
    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'stop')).toBe(true);
    const state = await methods.getScheduleRunAbortState(schedule.id, scheduledFor);
    expect(state?.abortSource).toBe('stop');
    expect(state?.abortPersistedAt).toBeUndefined();
  });

  it('lets deletion claim the source once the stop attempt resolved', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule));

    await methods.requestRunAbort(schedule.id, scheduledFor, 'stop');
    await methods.markRunAbortPersisted(schedule.id, scheduledFor);
    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'deletion')).toBe(true);
    const state = await methods.getScheduleRunAbortState(schedule.id, scheduledFor);
    expect(state?.abortSource).toBe('deletion');
  });

  it('re-opens the persistence marker on a fresh stop attempt', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule));

    await methods.requestRunAbort(schedule.id, scheduledFor, 'stop');
    await methods.markRunAbortPersisted(schedule.id, scheduledFor);
    // A SECOND stop attempt persists anew; the resolved marker of the first must not
    // release the owner's barrier while the new attempt's writes are in flight.
    await methods.requestRunAbort(schedule.id, scheduledFor, 'stop');
    const state = await methods.getScheduleRunAbortState(schedule.id, scheduledFor);
    expect(state?.abortPersistedAt).toBeUndefined();
  });

  it('reports false when no active run holds the occurrence', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule, { status: 'success' }));
    expect(
      await methods.requestRunAbort(schedule.id, new Date('2026-07-20T12:00:00Z'), 'stop'),
    ).toBe(false);
  });

  it('serializes concurrent stop attempts: the second answers in_progress', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule));

    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'stop')).toBe(true);
    // A second Stop while the first is unresolved must neither re-open the
    // persistence marker nor be told to proceed — its lost-CAS resolution would
    // release the settlement barrier while the winner is still persisting.
    expect(await methods.requestRunAbort(schedule.id, scheduledFor, 'stop')).toBe('in_progress');
  });

  it('marks abort persistence for the settlement barrier', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule));
    await methods.requestRunAbort(schedule.id, new Date('2026-07-20T12:00:00Z'), 'stop');
    await methods.markRunAbortPersisted(schedule.id, new Date('2026-07-20T12:00:00Z'));
    const state = await methods.getScheduleRunAbortState(
      schedule.id,
      new Date('2026-07-20T12:00:00Z'),
    );
    expect(state?.abortPersistedAt).toBeInstanceOf(Date);
  });
});

describe('recordRunOutcome settles a mid-generation balance refusal as skipped_balance', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('walks the balance streak instead of the failure streak and frees capacity', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule, { capacitySlot: 0, conversationId: 'c1' }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'skipped_balance',
      conversationId: 'c1',
      autoDisableAfterFailures: 5,
      balanceSkipDisableThreshold: 5,
    });

    const run = await ScheduleRun.findOne({ scheduleId: schedule.id }).lean();
    expect(run?.status).toBe('skipped_balance');
    expect(run?.capacitySlot).toBeUndefined();
    expect(run?.bookkept).toBe(true);

    const row = await Schedule.findOne({ id: schedule.id }).lean();
    expect(row?.balanceSkipCount).toBe(1);
    expect(row?.failureCount).toBe(0);
    expect(row?.enabled).toBe(true);
    expect(row?.lastRun?.status).toBe('skipped_balance');
  });

  it('auto-disables with insufficient_balance at the threshold, not too_many_failures', async () => {
    const schedule = await methods.createSchedule(scheduleData({ balanceSkipCount: 4 }));
    await ScheduleRun.create(runData(schedule, { capacitySlot: 0 }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'skipped_balance',
      autoDisableAfterFailures: 5,
      balanceSkipDisableThreshold: 5,
    });

    const row = await Schedule.findOne({ id: schedule.id }).lean();
    expect(row?.enabled).toBe(false);
    expect(row?.disabledReason).toBe('insufficient_balance');
  });

  it('is idempotent across the crash-retry replay (finalizeBookkeeping)', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(runData(schedule, { capacitySlot: 0 }));

    await methods.recordRunOutcome({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'skipped_balance',
      autoDisableAfterFailures: 5,
      balanceSkipDisableThreshold: 5,
    });
    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor,
      status: 'skipped_balance',
      autoDisableAfterFailures: 5,
      balanceSkipDisableThreshold: 5,
    });

    const row = await Schedule.findOne({ id: schedule.id }).lean();
    expect(row?.balanceSkipCount).toBe(1);
  });

  it('surfaces an unbookkept skipped_balance run to the reconciler', async () => {
    const schedule = await methods.createSchedule(scheduleData());
    await ScheduleRun.create(
      runData(schedule, {
        status: 'skipped_balance',
        bookkept: false,
        firedAt: new Date(Date.now() - 10 * 60_000),
      }),
    );
    const rows = await methods.getUnbookkeptRuns(new Date(Date.now() - 60_000), 10);
    expect(rows.map((run) => run.scheduleId)).toContain(schedule.id);
  });
});

describe('skip bookkeeping is crash-recoverable', () => {
  const scheduledFor = new Date('2026-07-20T12:00:00Z');

  it('marks skip rows bookkept only after the schedule-side writes land', async () => {
    const schedule = await methods.createSchedule(scheduleData({ balanceSkipCount: 3 }));
    await methods.recordSkippedRun({
      scheduleId: schedule.id,
      scheduledFor,
      user: schedule.user,
      status: 'skipped_overlap',
    });
    const run = await ScheduleRun.findOne({ scheduleId: schedule.id }).lean();
    expect(run?.bookkept).toBe(true);
    const row = await Schedule.findOne({ id: schedule.id }).lean();
    expect(row?.lastRun?.status).toBe('skipped_overlap');
    expect(row?.balanceSkipCount).toBe(0);
  });

  it('replays a half-applied overlap skip through the reconciler', async () => {
    const schedule = await methods.createSchedule(scheduleData({ balanceSkipCount: 3 }));
    // Simulate the crash: the row exists but no schedule-side write landed.
    await ScheduleRun.create(
      runData(schedule, {
        status: 'skipped_overlap',
        bookkept: false,
        firedAt: new Date(Date.now() - 10 * 60_000),
      }),
    );
    const rows = await methods.getUnbookkeptRuns(new Date(Date.now() - 60_000), 10);
    expect(rows.map((run) => run.scheduleId)).toContain(schedule.id);

    await methods.finalizeBookkeeping({
      scheduleId: schedule.id,
      scheduledFor: new Date('2026-07-20T12:00:00Z'),
      status: 'skipped_overlap',
      autoDisableAfterFailures: 5,
    });
    const row = await Schedule.findOne({ id: schedule.id }).lean();
    // Without the replay, the missed reset left a stale balance streak that a later
    // balance skip would push over the auto-disable threshold.
    expect(row?.balanceSkipCount).toBe(0);
    expect(row?.lastRun?.status).toBe('skipped_overlap');
    const run = await ScheduleRun.findOne({ scheduleId: schedule.id }).lean();
    expect(run?.bookkept).toBe(true);
  });
});

describe('deleteUnarmedSchedule (guarded create rollback)', () => {
  it('erases a drained unarmed row and its settled runs', async () => {
    const schedule = await methods.createSchedule(scheduleData({ nextRunAt: undefined }));
    await ScheduleRun.create(runData(schedule, { status: 'success' }));

    expect(await methods.deleteUnarmedSchedule(schedule.id, schedule.user)).toBe('deleted');
    expect(await Schedule.findOne({ id: schedule.id }).lean()).toBeNull();
    expect(await ScheduleRun.findOne({ scheduleId: schedule.id }).lean()).toBeNull();
  });

  it('defers to the drain when a live manual run holds the row', async () => {
    // An unarmed row is visible and Run Now-able: rollback must never hard-delete a
    // live generation's evidence out from under it. The soft-claim hides the row and
    // the ordinary erase-on-settle/sweep teardown erases it once the run settles.
    const schedule = await methods.createSchedule(scheduleData({ nextRunAt: undefined }));
    await ScheduleRun.create(runData(schedule, { status: 'started' }));

    expect(await methods.deleteUnarmedSchedule(schedule.id, schedule.user)).toBe('draining');
    const row = await Schedule.findOne({ id: schedule.id }).lean();
    expect(row?.deleting).toBe(true);
    expect(await ScheduleRun.findOne({ scheduleId: schedule.id }).lean()).not.toBeNull();
  });

  it('refuses to delete a row that has since been armed', async () => {
    const schedule = await methods.createSchedule(scheduleData());

    // An ambiguously-committed arm (or a concurrent replay's arm) landed: the row is a
    // live schedule another response may have confirmed, so the rollback must not
    // erase it.
    expect(await methods.deleteUnarmedSchedule(schedule.id, schedule.user)).toBe('kept');
    expect(await Schedule.findOne({ id: schedule.id }).lean()).not.toBeNull();
  });

  it('refuses to delete an unarmed row a concurrent edit has moved past', async () => {
    const schedule = await methods.createSchedule(
      scheduleData({ nextRunAt: undefined, configRevision: 0 }),
    );
    // A PATCH that disables the schedule leaves it UNARMED but bumps the revision —
    // the row now embodies the owner's edit, and the POST's rollback must not erase it.
    await methods.updateScheduleById(schedule.id, schedule.user, { enabled: false });

    expect(await methods.deleteUnarmedSchedule(schedule.id, schedule.user, 0)).toBe('kept');
    expect(await Schedule.findOne({ id: schedule.id }).lean()).not.toBeNull();
  });

  it('arms through the shared CAS without rotating the claim token or revision', async () => {
    const schedule = await methods.createSchedule(
      scheduleData({ nextRunAt: undefined, claimToken: 'ct-live', configRevision: 0 }),
    );
    expect(await methods.armSchedule(schedule.id, new Date(Date.now() + 60_000), 0)).toBe(true);
    // A second armer (the original POST racing a replay) must collapse to a no-op.
    expect(await methods.armSchedule(schedule.id, new Date(Date.now() + 120_000), 0)).toBe(false);
    const row = await Schedule.findOne({ id: schedule.id }).lean();
    expect(row?.claimToken).toBe('ct-live');
    expect(row?.configRevision).toBe(0);
  });

  it('refuses the revision-fenced arm after a concurrent edit', async () => {
    const schedule = await methods.createSchedule(
      scheduleData({ nextRunAt: undefined, configRevision: 0 }),
    );
    await methods.updateScheduleById(schedule.id, schedule.user, { name: 'edited' });
    expect(await methods.armSchedule(schedule.id, new Date(Date.now() + 60_000), 0)).toBe(false);
  });

  it('reports a missing row distinctly', async () => {
    expect(await methods.deleteUnarmedSchedule('sched_gone', new mongoose.Types.ObjectId())).toBe(
      'missing',
    );
  });
});

describe('erasure sweep rotation and idempotency-key lookup', () => {
  it('rotates the deleting window so undrainable rows cannot starve later ones', async () => {
    const user = new mongoose.Types.ObjectId();
    const first = scheduleData({ user, deleting: true, nextRunAt: undefined });
    const second = scheduleData({ user, deleting: true, nextRunAt: undefined });
    await Schedule.create(first);
    await Schedule.create(second);

    const window = await methods.getDeletingSchedules(1);
    expect(window).toHaveLength(1);
    await methods.markEraseAttempted(window.map((row) => row.id));

    const rotated = await methods.getDeletingSchedules(1);
    expect(rotated[0].id).not.toBe(window[0].id);
  });

  it('rotates the per-owner deletion-retry window the same way', async () => {
    const user = new mongoose.Types.ObjectId();
    await Schedule.create(scheduleData({ user, deleting: true, nextRunAt: undefined }));
    await Schedule.create(scheduleData({ user, deleting: true, nextRunAt: undefined }));

    const window = await methods.getDeletingScheduleIds(user, 1);
    expect(window).toHaveLength(1);
    await methods.markEraseAttempted(window);

    // The list-path retry is bounded too; without least-recently-attempted
    // ordering an owner with more stuck rows than the limit re-drives the same
    // unconfirmable few on every list and never reaches the rest.
    const rotated = await methods.getDeletingScheduleIds(user, 1);
    expect(rotated[0]).not.toBe(window[0]);
  });

  it('resolves an idempotency key even while its row is draining', async () => {
    const user = new mongoose.Types.ObjectId();
    const schedule = scheduleData({ user, deleting: true, clientRequestId: 'intent-9' });
    await Schedule.create(schedule);

    const found = await methods.getScheduleByClientRequestId(user, 'intent-9');
    expect(found?.id).toBe(schedule.id);
  });
});
