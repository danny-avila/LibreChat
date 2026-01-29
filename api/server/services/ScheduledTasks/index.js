const { logger } = require('@librechat/data-schemas');
const { replaceSpecialVars, EModelEndpoint, Constants } = require('librechat-data-provider');
const { buildOptions, initializeClient } = require('~/server/services/Endpoints/agents');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { disposeClient } = require('~/server/cleanup');
const { getAppConfig } = require('~/server/services/Config');
const { ScheduledTask } = require('~/db/models');
const {
  createScheduledTaskRun,
  updateScheduledTask,
  updateScheduledTaskRun,
  getUserById,
  deleteConvos,
} = require('~/models');
const { getNextRunAt } = require('./utils');
const { isScheduledTasksLeader } = require('./leader');

const DEFAULT_CONFIG = {
  enabled: true,
  workerEnabled: true,
  minIntervalMinutes: 10,
  maxConcurrentRuns: 3,
  maxRuntimeSeconds: 900,
};

const SCHEDULED_TASKS_TICK_SECONDS = Number(process.env.SCHEDULED_TASKS_TICK_SECONDS ?? 30);
const SCHEDULED_TASKS_TICK_MS =
  Number.isFinite(SCHEDULED_TASKS_TICK_SECONDS) && SCHEDULED_TASKS_TICK_SECONDS > 0
    ? SCHEDULED_TASKS_TICK_SECONDS * 1000
    : 30000;

let schedulerTimer = null;
let schedulerConfig = null;
let activeRuns = 0;
const runQueue = [];
let processingQueue = false;

const resolveSchedulerConfig = async (appConfig) => {
  if (appConfig?.scheduledTasks) {
    schedulerConfig = { ...DEFAULT_CONFIG, ...appConfig.scheduledTasks };
    return schedulerConfig;
  }

  if (schedulerConfig) {
    return schedulerConfig;
  }

  try {
    const resolved = await getAppConfig();
    schedulerConfig = {
      ...DEFAULT_CONFIG,
      ...(resolved?.scheduledTasks ?? {}),
    };
  } catch (error) {
    logger.error('[ScheduledTasks] Failed to load app config, using defaults', error);
    schedulerConfig = DEFAULT_CONFIG;
  }

  return schedulerConfig;
};

const createSchedulerReq = ({ user, appConfig, task, prompt, endpointOption }) => {
  return {
    user,
    config: appConfig,
    body: {
      text: prompt,
      endpoint: EModelEndpoint.agents,
      endpointType: EModelEndpoint.agents,
      agent_id: task.agentId,
      conversationId: 'new',
      files: [],
      isTemporary: false,
      endpointOption,
    },
  };
};

const createSchedulerRes = () => {
  const res = {
    write: () => true,
    end: () => {},
    status: () => res,
    json: () => res,
    setHeader: () => {},
    getHeader: () => undefined,
    clearCookie: () => {},
    headersSent: false,
    writableEnded: false,
    flush: () => {},
    locals: {},
  };
  return res;
};

const detectErrorType = (error, aborted) => {
  if (aborted) {
    return 'timeout';
  }
  const message = (error?.message || '').toLowerCase();
  if (message.includes('oauth') || message.includes('token') || message.includes('unauthorized')) {
    return 'oauth';
  }
  if (message.includes('validation')) {
    return 'validation';
  }
  return 'runtime';
};

const buildErrorDetails = (error) => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const details = {
    name: error.name,
    code: error.code,
    status: error.status,
    type: error.type,
  };
  Object.keys(details).forEach((key) => {
    if (details[key] == null) {
      delete details[key];
    }
  });
  return Object.keys(details).length > 0 ? details : null;
};

const executeScheduledTask = async ({ task, run, user, appConfig, maxRuntimeSeconds }) => {
  let client = null;
  let conversationId = null;
  let finishedAt = null;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), maxRuntimeSeconds * 1000);

  try {
    const prompt = replaceSpecialVars({ text: task.prompt, user });
    const req = createSchedulerReq({ user, appConfig, task, prompt });
    const res = createSchedulerRes();
    const endpointOption = buildOptions(
      req,
      EModelEndpoint.agents,
      { agent_id: task.agentId },
      EModelEndpoint.agents,
    );
    req.body.endpointOption = endpointOption;

    const initResult = await initializeClient({
      req,
      res,
      signal: abortController.signal,
      endpointOption,
    });

    client = initResult.client;

    const response = await client.sendMessage(prompt, {
      user: user.id,
      conversationId: undefined,
      parentMessageId: Constants.NO_PARENT,
      abortController,
      userMCPAuthMap: initResult.userMCPAuthMap,
      progressOptions: {
        res: {
          write: () => true,
          end: () => {},
          headersSent: false,
          writableEnded: false,
        },
      },
    });

    const dbResult = await response.databasePromise;
    conversationId = dbResult?.conversation?.conversationId ?? response?.conversationId;

    await addTitle(req, {
      text: prompt,
      response,
      client,
    });

    finishedAt = new Date();

    await updateScheduledTaskRun({
      runId: run._id,
      updates: {
        status: 'success',
        finishedAt,
        conversationId,
      },
    });

    return { success: true, conversationId, finishedAt };
  } catch (error) {
    finishedAt = new Date();
    const aborted = abortController.signal.aborted;
    const errorType = detectErrorType(error, aborted);
    const errorMessage = error?.message ? String(error.message).slice(0, 500) : 'Unknown error';

    await updateScheduledTaskRun({
      runId: run._id,
      updates: {
        status: 'failure',
        finishedAt,
        errorType,
        errorMessage,
        errorDetails: buildErrorDetails(error),
      },
    });

    if (conversationId || client?.conversationId) {
      const convoId = conversationId || client.conversationId;
      try {
        await deleteConvos(user.id, { conversationId: convoId });
      } catch (deleteError) {
        logger.warn('[ScheduledTasks] Failed to cleanup conversation after error', deleteError);
      }
    }

    return {
      success: false,
      finishedAt,
      errorType,
      errorMessage,
    };
  } finally {
    clearTimeout(timeoutId);
    if (client) {
      disposeClient(client);
    }
  }
};

const finalizeTaskRun = async ({ task, run, userId, finishedAt, status }) => {
  let nextRunAt = null;
  if (task.enabled) {
    try {
      nextRunAt = getNextRunAt({ cron: task.cron, timezone: task.timezone, fromDate: finishedAt });
    } catch (error) {
      logger.error('[ScheduledTasks] Failed to compute next run time', error);
      nextRunAt = null;
    }
  }

  await updateScheduledTask({
    id: task.id,
    userId,
    updates: {
      lastRunAt: run.startedAt,
      lastRunStatus: status,
      lastRunId: run._id,
      nextRunAt,
      lockedAt: null,
      lockExpiresAt: null,
    },
  });
};

const startTaskRun = async ({ task, run, user, appConfig, maxRuntimeSeconds }) => {
  try {
    const result = await executeScheduledTask({
      task,
      run,
      user,
      appConfig,
      maxRuntimeSeconds,
    });

    await finalizeTaskRun({
      task,
      run,
      userId: user.id,
      finishedAt: result.finishedAt ?? new Date(),
      status: result.success ? 'success' : 'failure',
    });
  } catch (error) {
    logger.error('[ScheduledTasks] Error completing scheduled task run', error);
  }
};

const processQueue = async () => {
  if (processingQueue) {
    return;
  }

  processingQueue = true;
  try {
    const config = await resolveSchedulerConfig();

    while (activeRuns < config.maxConcurrentRuns && runQueue.length > 0) {
      const job = runQueue.shift();
      if (!job) {
        break;
      }
      activeRuns += 1;
      startTaskRun(job).finally(() => {
        activeRuns -= 1;
        processQueue();
      });
    }
  } finally {
    processingQueue = false;
  }
};

const enqueueTaskRun = async ({ task, user, source }) => {
  const scheduledConfig = await resolveSchedulerConfig();
  const userId = user?.id || task.user?.toString();

  const userDoc =
    user && user._id
      ? user
      : await getUserById(userId, '-password -__v -totpSecret -backupCodes -emailVerified');

  if (!userDoc) {
    throw new Error('Scheduled task user not found');
  }

  const safeUser = {
    ...userDoc,
    id: userDoc.id || userDoc._id?.toString(),
  };

  const startedAt = new Date();
  const lockExpiresAt = new Date(
    startedAt.getTime() + (scheduledConfig.maxRuntimeSeconds + 60) * 1000,
  );

  const run = await createScheduledTaskRun({
    taskId: task.id,
    user: userDoc._id,
    agentId: task.agentId,
    startedAt,
    status: 'running',
  });

  await updateScheduledTask({
    id: task.id,
    userId: safeUser.id,
    updates: {
      lastRunAt: startedAt,
      lastRunStatus: 'running',
      lastRunId: run._id,
      lockedAt: startedAt,
      lockExpiresAt,
    },
  });

  runQueue.push({
    task,
    run,
    user: safeUser,
    appConfig: await getAppConfig(),
    maxRuntimeSeconds: scheduledConfig.maxRuntimeSeconds,
    source,
  });

  processQueue();

  return run;
};

const claimDueTask = async ({ now, lockExpiresAt }) => {
  return ScheduledTask.findOneAndUpdate(
    {
      enabled: true,
      nextRunAt: { $lte: now },
      $or: [{ lockExpiresAt: null }, { lockExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        lockedAt: now,
        lockExpiresAt,
      },
    },
    {
      sort: { nextRunAt: 1 },
      new: true,
    },
  ).lean();
};

const schedulerTick = async () => {
  try {
    const leader = await isScheduledTasksLeader();
    if (!leader) {
      return;
    }

    const config = await resolveSchedulerConfig();
    if (config.enabled === false || config.workerEnabled === false) {
      return;
    }
    const availableSlots = Math.max(0, config.maxConcurrentRuns - activeRuns - runQueue.length);
    if (availableSlots === 0) {
      return;
    }

    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + (config.maxRuntimeSeconds + 60) * 1000);

    for (let i = 0; i < availableSlots; i += 1) {
      const task = await claimDueTask({ now, lockExpiresAt });
      if (!task) {
        break;
      }
      await enqueueTaskRun({ task, source: 'schedule' });
    }
  } catch (error) {
    logger.error('[ScheduledTasks] Scheduler tick failed', error);
  }
};

const startScheduledTasksScheduler = async (appConfig) => {
  if (schedulerTimer) {
    return;
  }

  const config = await resolveSchedulerConfig(appConfig);
  if (config.enabled === false) {
    logger.info('[ScheduledTasks] Scheduler not started (feature disabled)');
    return;
  }
  if (config.workerEnabled === false) {
    logger.info('[ScheduledTasks] Scheduler not started (worker disabled)');
    return;
  }
  schedulerTimer = setInterval(schedulerTick, SCHEDULED_TASKS_TICK_MS);
  schedulerTimer.unref();
  schedulerTick();

  logger.info('[ScheduledTasks] Scheduler started');
};

const stopScheduledTasksScheduler = () => {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
};

module.exports = {
  startScheduledTasksScheduler,
  stopScheduledTasksScheduler,
  enqueueTaskRun,
};
