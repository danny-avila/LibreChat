const crypto = require('crypto');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { runScheduledTurn } = require('./runScheduledTurn');
const { getNextCronRun } = require('./cron');
const db = require('~/models');

const POLL_INTERVAL_MS = 60_000;
/** A claim older than this is considered abandoned (instance crashed mid-run). */
const LOCK_TTL_MS = 10 * 60_000;
/** Cap schedules processed per tick so one busy minute can't monopolize the loop. */
const MAX_PER_TICK = 25;

const INSTANCE_ID = `${process.pid}-${crypto.randomUUID()}`;

let running = false;
let timer = null;

/**
 * Computes the next run instant for a schedule after `from`, or null when the
 * schedule is exhausted (a one-time run that has fired).
 */
function computeNextRunAt(schedule, from) {
  if (schedule.scheduleType === 'recurring' && schedule.cron) {
    return getNextCronRun(schedule.cron, from, schedule.timezone || 'UTC');
  }
  return null;
}

async function runOneSchedule(schedule) {
  const startedAt = new Date();
  try {
    const owner = await db.getUserById(schedule.user);
    if (!owner) {
      throw new Error('Schedule owner not found');
    }

    const { conversationId } = await runScheduledTurn({ owner, schedule });

    const nextRunAt = computeNextRunAt(schedule, startedAt);
    await db.markScheduleResult(schedule._id, {
      status: 'success',
      conversationId,
      error: null,
      nextRunAt,
      enabled: schedule.scheduleType === 'once' ? false : undefined,
    });
  } catch (error) {
    logger.error(`[Scheduler] Run failed for schedule ${schedule._id}:`, error);
    const nextRunAt = computeNextRunAt(schedule, startedAt);
    await db.markScheduleResult(schedule._id, {
      status: 'error',
      error: error?.message ?? String(error),
      nextRunAt,
      enabled: schedule.scheduleType === 'once' ? false : undefined,
    });
  }
}

/**
 * One poll tick: atomically claims and runs due schedules across all tenants
 * until none remain (or the per-tick cap is hit). The claim query runs as
 * system so it can scan every tenant; each run then switches into its owner's
 * tenant context.
 */
async function tick() {
  if (running) {
    return;
  }
  running = true;
  try {
    for (let i = 0; i < MAX_PER_TICK; i++) {
      const now = new Date();
      const schedule = await runAsSystem(() =>
        db.claimDueSchedule(now, INSTANCE_ID, LOCK_TTL_MS),
      );
      if (!schedule) {
        break;
      }
      await runOneSchedule(schedule);
    }
  } catch (error) {
    logger.error('[Scheduler] Poll tick error:', error);
  } finally {
    running = false;
  }
}

/**
 * Starts the skill-schedule poller. Idempotent — a second call is a no-op.
 * State lives entirely in MongoDB, so the poller is stateless and resumes
 * cleanly across restarts.
 */
function startSkillScheduler() {
  if (timer) {
    return;
  }
  logger.info(`[Scheduler] Starting skill scheduler (instance ${INSTANCE_ID})`);
  timer = setInterval(() => {
    tick().catch((error) => logger.error('[Scheduler] Unhandled tick error:', error));
  }, POLL_INTERVAL_MS);
  timer.unref?.();
}

function stopSkillScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startSkillScheduler, stopSkillScheduler, computeNextRunAt };
