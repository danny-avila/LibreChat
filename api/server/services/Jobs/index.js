const crypto = require('crypto');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { runJobStep } = require('./runJobStep');
const { decideNextStep, canRunStep } = require('./planner');
const { publishJobUpdate } = require('./events');
const db = require('~/models');

const POLL_INTERVAL_MS = 5_000;
/** A claim older than this is considered abandoned (instance crashed mid-step). */
const LOCK_TTL_MS = 10 * 60_000;
/** Cap steps processed per tick so one job can't monopolize the loop. */
const MAX_PER_TICK = 10;

const INSTANCE_ID = `${process.pid}-${crypto.randomUUID()}`;

let running = false;
let timer = null;

/** Records a step outcome, then pushes the fresh job state to live listeners. */
async function recordAndPublish(jobId, userId, result, type) {
  await db.recordJobStep(jobId, result);
  try {
    const updated = await db.getAgentJobById(jobId, userId);
    if (updated) {
      publishJobUpdate(jobId, { type, job: updated });
    }
  } catch (error) {
    logger.error(`[Jobs] Failed to publish update for job ${jobId}:`, error);
  }
}

/**
 * Runs one step of a claimed job, then records the outcome and decides the next
 * status via the planner. The job stays `running` (claim released) so the next
 * tick advances it, or becomes terminal (`done` / `error`).
 */
async function runOneJobStep(job) {
  const stepIndex = job.currentStep ?? 0;
  const startedAt = new Date();

  const checkpoint = job.checkpoint && typeof job.checkpoint === 'object' ? job.checkpoint : {};
  const stepSummaries = Array.isArray(checkpoint.stepSummaries) ? checkpoint.stepSummaries : [];
  const parentMessageId = checkpoint.lastMessageId;

  try {
    const owner = await db.getUserById(job.user);
    if (!owner) {
      throw new Error('Job owner not found');
    }

    if (!canRunStep(job)) {
      await recordAndPublish(
        job._id,
        job.user,
        {
          step: {
            index: stepIndex,
            status: 'success',
            summary: 'Reached maximum step count',
            startedAt,
            endedAt: new Date(),
          },
          status: 'done',
          currentStep: stepIndex,
        },
        'status',
      );
      return;
    }

    const { responseText, messageId } = await runJobStep({
      owner,
      job,
      stepIndex,
      stepSummaries,
      parentMessageId,
    });

    const decision = decideNextStep({
      job,
      stepIndex,
      responseText,
      priorSummaries: stepSummaries,
      messageId,
    });

    await recordAndPublish(
      job._id,
      job.user,
      {
        step: {
          index: stepIndex,
          status: 'success',
          summary: decision.summary,
          messageId,
          startedAt,
          endedAt: new Date(),
        },
        status: decision.status,
        currentStep: decision.currentStep,
        checkpoint: decision.checkpoint,
        pendingClientOp: decision.pendingClientOp ?? null,
      },
      decision.status === 'waiting_client' ? 'status' : 'step',
    );
  } catch (error) {
    logger.error(`[Jobs] Step ${stepIndex} failed for job ${job._id}:`, error);
    await recordAndPublish(
      job._id,
      job.user,
      {
        step: {
          index: stepIndex,
          status: 'error',
          summary: error?.message ?? String(error),
          startedAt,
          endedAt: new Date(),
        },
        status: 'error',
        currentStep: stepIndex,
        error: error?.message ?? String(error),
      },
      'status',
    );
  }
}

/**
 * One poll tick: atomically claims and advances runnable jobs across all
 * tenants until none remain (or the per-tick cap is hit). The claim query runs
 * as system so it can scan every tenant; each step then switches into its
 * owner's tenant context.
 */
async function tick() {
  if (running) {
    return;
  }
  running = true;
  try {
    for (let i = 0; i < MAX_PER_TICK; i++) {
      const now = new Date();
      const job = await runAsSystem(() => db.claimDueJob(now, INSTANCE_ID, LOCK_TTL_MS));
      if (!job) {
        break;
      }
      await runOneJobStep(job);
    }
  } catch (error) {
    logger.error('[Jobs] Poll tick error:', error);
  } finally {
    running = false;
  }
}

/**
 * Starts the agent-job worker. Idempotent — a second call is a no-op. State
 * lives entirely in MongoDB, so the worker is stateless and resumes cleanly
 * across restarts.
 */
function startJobWorker() {
  if (timer) {
    return;
  }
  logger.info(`[Jobs] Starting agent-job worker (instance ${INSTANCE_ID})`);
  timer = setInterval(() => {
    tick().catch((error) => logger.error('[Jobs] Unhandled tick error:', error));
  }, POLL_INTERVAL_MS);
  timer.unref?.();
}

function stopJobWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startJobWorker, stopJobWorker };
