const mongoose = require('mongoose');
const {
  Permissions,
  PermissionTypes,
  getRefillEligibilityDate,
} = require('librechat-data-provider');
const { logger, runAsSystem, tenantStorage } = require('@librechat/data-schemas');
const { resolveAgentFireAccess } = require('./access');
const {
  fireSchedule,
  getBalanceConfig,
  startScheduleEngine,
  generateShortLivedToken,
  buildBalanceUpdateFields,
  getAppConfigOptionsFromUser,
  DEFAULT_SCHEDULE_LIMITS,
  SCHEDULE_FIRE_TOKEN_TTL,
  SCHEDULE_FIRE_SCOPE,
} = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config/app');
const methods = require('~/models');

/**
 * Resolves schedule limits, honoring per-principal (role/user) config overrides
 * when a user is supplied (routes pass req.user, the fire path passes the owner).
 * @returns {Promise<import('@librechat/api').ScheduleLimits>}
 */
async function getLimits(user) {
  const appConfig = user
    ? await getAppConfig(getAppConfigOptionsFromUser(user))
    : await getAppConfig();
  const config = appConfig?.interfaceConfig?.schedules;
  // Disabled config is a hard stop: the engine must not keep firing existing
  // schedules after an admin turns the feature off.
  if (config === false) {
    return { ...DEFAULT_SCHEDULE_LIMITS, enabled: false };
  }
  if (config == null || typeof config === 'boolean') {
    return DEFAULT_SCHEDULE_LIMITS;
  }
  return {
    enabled: config.use !== false,
    maxPerUser: config.maxPerUser ?? DEFAULT_SCHEDULE_LIMITS.maxPerUser,
    minIntervalMinutes: config.minIntervalMinutes ?? DEFAULT_SCHEDULE_LIMITS.minIntervalMinutes,
    autoDisableAfterFailures:
      config.autoDisableAfterFailures ?? DEFAULT_SCHEDULE_LIMITS.autoDisableAfterFailures,
    fireConcurrency: config.fireConcurrency ?? DEFAULT_SCHEDULE_LIMITS.fireConcurrency,
  };
}

const MANUAL_RUN_LEASE_MS = 5 * 60 * 1000;

/**
 * Whether a refill would top up this zero-credit balance record right now,
 * mirroring the chat balance check's auto-refill eligibility (record-based).
 * @param {{ autoRefillEnabled?: boolean, refillAmount?: number, refillIntervalValue?: number, refillIntervalUnit?: import('librechat-data-provider').RefillIntervalUnit, lastRefill?: Date } | null | undefined} record
 * @returns {boolean}
 */
function isRefillEligible(record) {
  if (record?.autoRefillEnabled !== true) {
    return false;
  }
  if (!(typeof record.refillAmount === 'number' && record.refillAmount > 0)) {
    return false;
  }
  const lastRefillDate = new Date(record.lastRefill ?? 0);
  if (Number.isNaN(lastRefillDate.getTime())) {
    return true;
  }
  // Mirror checkBalanceRecord's fallbacks exactly (interval 0 / 'days' when a
  // partially-synced record is missing them) so we never pre-skip a record the
  // interactive chat balance check would have refilled.
  return (
    new Date() >=
    getRefillEligibilityDate(
      lastRefillDate,
      record.refillIntervalValue ?? 0,
      record.refillIntervalUnit ?? 'days',
    )
  );
}

/** @type {import('@librechat/api').ScheduleEngineDeps} */
const engineDeps = {
  methods,
  getLimits,
  getUserContext: async (userId) => {
    const user = await mongoose.models.User.findById(userId).select('_id tenantId role').lean();
    if (user == null) {
      return null;
    }
    return { id: user._id.toString(), tenantId: user.tenantId, role: user.role };
  },
  hasScheduleAccess: async (user) => {
    const role = await methods.getRoleByName(user.role);
    return role?.permissions?.[PermissionTypes.SCHEDULES]?.[Permissions.USE] === true;
  },
  isOutOfBalance: async (user) => {
    const appConfig = await getAppConfig(getAppConfigOptionsFromUser(user));
    const balanceConfig = getBalanceConfig(appConfig);
    if (balanceConfig?.enabled !== true) {
      return false;
    }
    const Balance = mongoose.models.Balance;
    let record = await Balance.findOne({ user: user.id }).lean();
    // Initialize/sync the record exactly as the chat's balance middleware would,
    // so a new user's startBalance is applied before we read it (avoids skipping
    // a schedule that an interactive chat would have allowed).
    if (balanceConfig.startBalance != null) {
      const updateFields = buildBalanceUpdateFields(balanceConfig, record, user.id);
      if (Object.keys(updateFields).length > 0) {
        record = await Balance.findOneAndUpdate(
          { user: user.id },
          { $set: updateFields },
          { upsert: true, new: true },
        ).lean();
      }
    }
    const credits = record?.tokenCredits ?? 0;
    if (credits > 0) {
      return false;
    }
    // At/below zero: an auto-refill user is only spared a pre-skip when a refill
    // would actually fire now (mirrors the chat balance check's eligibility). If
    // they aren't eligible yet, or the refill settings are incomplete, pre-skip as
    // a balance skip — otherwise the zero-credit fire reaches the chat, is rejected
    // there, and records a generic error that walks the schedule toward
    // too_many_failures instead of skipped_balance/insufficient_balance.
    if (balanceConfig.autoRefillEnabled === true && isRefillEligible(record)) {
      return false;
    }
    return true;
  },
  // Mirrors the loopback chat route's authorization (role AGENTS:USE + resource
  // VIEW with the manage:agents bypass); shared with the create/update precheck
  // so the two never diverge.
  agentAccess: (agentId, user) => resolveAgentFireAccess(agentId, user),
  resolveFiles: async (fileIds, user) => {
    const files = await methods.getFiles(
      { file_id: { $in: fileIds }, user: user.id },
      null,
      '-text',
    );
    return (files ?? []).map((file) => ({
      file_id: file.file_id,
      filepath: file.filepath,
      filename: file.filename,
      type: file.type,
      height: file.height,
      width: file.width,
      source: file.source,
    }));
  },
  mintFireToken: (userId) =>
    generateShortLivedToken(userId, SCHEDULE_FIRE_TOKEN_TTL, { scope: SCHEDULE_FIRE_SCOPE }),
  getSelfUrl: () =>
    process.env.SCHEDULES_SELF_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3080}`,
  runInTenantContext: (user, fn) =>
    tenantStorage.run({ tenantId: user.tenantId, userId: user.id }, fn),
  getJobStatus: async (conversationId) => {
    const { GenerationJobManager } = require('@librechat/api');
    const job = await GenerationJobManager.getJobStore()?.getJob(conversationId);
    return job?.status ?? null;
  },
  clearReconciledJob: async (conversationId) => {
    const { GenerationJobManager } = require('@librechat/api');
    await GenerationJobManager.getJobStore()?.deleteJob(conversationId);
  },
  // Counted in system scope so the cap is GLOBAL — a per-owner (tenant-scoped)
  // count would let multiple tenants collectively exceed fireConcurrency.
  countActiveRunsGlobal: () => runAsSystem(() => methods.countActiveRuns()),
};

/** @type {ReturnType<typeof startScheduleEngine> | undefined} */
let engine;

async function initializeScheduleEngine() {
  if (engine != null) {
    return engine;
  }
  // Explicitly build the Schedule/ScheduleRun indexes first — the unique
  // idempotency index and TTL retention index would otherwise never exist when
  // MONGO_AUTO_INDEX is disabled (the production default). If this fails the
  // unique {scheduleId, scheduledFor} guard may be absent, so leave the engine
  // DISABLED rather than firing without duplicate protection — the app still
  // runs; schedules simply don't fire until an operator resolves the index.
  try {
    await runAsSystem(() => methods.ensureScheduleIndexes());
  } catch (err) {
    logger.error(
      '[schedules] index creation failed — scheduler NOT started (fires need the unique idempotency index):',
      err,
    );
    return undefined;
  }
  engine = startScheduleEngine(engineDeps);
  return engine;
}

/**
 * Manual run-now fire. Acquires the schedule lease to serialize concurrent
 * run-now clicks (and to block against a background engine claim), then fires
 * in manual mode so the next automatic occurrence is left untouched. Returns
 * null when the lease is already held (a run is in progress).
 */
async function fireScheduleNow(schedule, limits) {
  const acquired = await methods.acquireManualRunLease(
    schedule.id,
    schedule.user,
    MANUAL_RUN_LEASE_MS,
  );
  if (!acquired) {
    return null;
  }
  try {
    return await fireSchedule(engineDeps, schedule, limits, new Date(), { manual: true });
  } catch (err) {
    await methods.releaseLease(schedule.id).catch(() => undefined);
    throw err;
  }
}

const OUTCOME_RETRY_ATTEMPTS = 3;

/**
 * Completion hook: called from the agents controller finalize paths when the
 * request carried a scheduleId. The caller deletes the job (`completeJob`) right
 * after, destroying the only evidence the reconciler could use — so a transient
 * Mongo failure here is RETRIED (bounded) before giving up, and the failure is
 * surfaced to the caller (returns false) so it can keep the job when it matters.
 * @returns {Promise<boolean>} true when the outcome was recorded.
 */
async function recordScheduleOutcome({ scheduleId, scheduledFor, status, conversationId, error }) {
  if (!scheduleId || !scheduledFor) {
    return true;
  }
  for (let attempt = 1; attempt <= OUTCOME_RETRY_ATTEMPTS; attempt++) {
    try {
      // Resolve the owner's limits so auto-disable uses the same per-principal
      // threshold as the fire path (not the global default).
      const schedule = await methods.getScheduleById(scheduleId);
      const owner = schedule ? await engineDeps.getUserContext(schedule.user) : null;
      const limits = await getLimits(owner ?? undefined);
      await methods.recordRunOutcome({
        scheduleId,
        scheduledFor: new Date(scheduledFor),
        status,
        conversationId,
        error,
        autoDisableAfterFailures: limits.autoDisableAfterFailures,
      });
      return true;
    } catch (err) {
      logger.error(
        `[schedules] failed to record run outcome (attempt ${attempt}/${OUTCOME_RETRY_ATTEMPTS}):`,
        err,
      );
    }
  }
  return false;
}

/**
 * Moves a paused scheduled run back to `started` when its HITL resume claim
 * succeeds, so overlap/capacity (which key on `started`) count the resuming
 * generation as active and a second run for the same schedule can't start
 * concurrently. Best-effort: a failure just leaves it `requires_action` (the
 * terminal hook still records the outcome).
 * @returns {Promise<void>}
 */
async function markScheduleRunActive(scheduleId, scheduledFor) {
  if (!scheduleId || !scheduledFor) {
    return;
  }
  try {
    await methods.transitionRunStatus(
      scheduleId,
      new Date(scheduledFor),
      'requires_action',
      'started',
    );
  } catch (err) {
    logger.error('[schedules] failed to mark resumed run active:', err);
  }
}

module.exports = {
  getLimits,
  engineDeps,
  fireScheduleNow,
  recordScheduleOutcome,
  markScheduleRunActive,
  initializeScheduleEngine,
};
