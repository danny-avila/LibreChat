const { logger, isValidObjectIdString } = require('@librechat/data-schemas');
const { Constants, parseCompactConvo } = require('librechat-data-provider');
const { getScheduledTask, updateScheduledTask, getUserById } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');
const { initializeClient, buildOptions } = require('~/server/services/Endpoints/agents');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getAppConfig } = require('~/server/services/Config');

const LOG_PREFIX = '[scheduled-tasks]';
const DEFAULT_TASK_TEXT = 'Scheduled Task Execution';

/**
 * @param {import('bullmq').Job | { data?: { taskId?: unknown } }} job
 * @returns {string | null} Mongo task id, or null when the payload is invalid.
 */
function parseJobTaskId(job) {
  const taskId = job?.data?.taskId;
  if (typeof taskId !== 'string' || !isValidObjectIdString(taskId)) {
    logger.warn(`${LOG_PREFIX} Invalid or missing taskId in job payload`);
    return null;
  }
  return taskId;
}

/**
 * Builds a request-like object that AgentController can consume from a
 * scheduled-task definition. Each run starts a fresh conversation so background
 * runs never mutate the user's interactive chats.
 */
async function buildRequestFromTask(task, taskId) {
  const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
  const {
    text,
    isTemporary,
    endpoint,
    model,
    endpointOption: payloadEndpointOption,
    ephemeralAgent,
    ...restPayload
  } = payload;

  let userRecord = null;
  try {
    userRecord = await getUserById(task.userId, '-password');
  } catch (error) {
    logger.warn(`${LOG_PREFIX} Failed to fetch user ${task.userId}`, error);
  }

  const appConfig = await getAppConfig({
    role: userRecord?.role,
    tenantId: userRecord?.tenantId,
  }).catch((error) => {
    logger.warn(`${LOG_PREFIX} Failed to resolve appConfig, continuing with empty config`, error);
    return null;
  });

  const req = {
    user: userRecord ? { ...userRecord, id: task.userId } : { id: task.userId },
    config: appConfig || { interfaceConfig: {} },
    body: {
      ...restPayload,
      text: text || DEFAULT_TASK_TEXT,
      conversationId: 'new',
      isTemporary: isTemporary === true,
      ephemeralAgent,
      endpointOption: payloadEndpointOption || {},
      agent_id: Constants.EPHEMERAL_AGENT_ID,
      endpoint,
      model,
    },
    scheduledTaskMeta: { taskId, isScheduled: true },
  };

  if (!endpoint) {
    const message = `Task ${taskId} is missing payload.endpoint`;
    logger.error(`${LOG_PREFIX} ${message}`);
    throw new Error(message);
  }

  let parsedBody = {};
  try {
    parsedBody =
      parseCompactConvo({
        endpoint,
        conversation: { ...payload, endpoint, model },
      }) || {};
  } catch (error) {
    logger.warn(
      `${LOG_PREFIX} parseCompactConvo failed for task ${taskId}, falling back to model only`,
      error,
    );
    parsedBody = { model };
  }

  try {
    const builtOption = await buildOptions(req, endpoint, {
      ...parsedBody,
      agent_id: Constants.EPHEMERAL_AGENT_ID,
    });
    req.body.endpointOption = builtOption;
  } catch (error) {
    logger.error(
      `${LOG_PREFIX} Failed to build endpoint option for task ${taskId} (endpoint=${endpoint})`,
      error,
    );
    throw error;
  }

  return req;
}

/**
 * Minimal Express `res` stub so AgentController can run outside HTTP.
 */
function buildResponseMock() {
  return {
    on: () => {},
    removeListener: () => {},
    json: () => {},
    end: () => {},
    write: () => true,
    setHeader: () => {},
    status() {
      return this;
    },
    send: () => {},
    headersSent: false,
    finished: false,
  };
}

/**
 * BullMQ worker entry point for a single scheduled-task run.
 *
 * @param {import('bullmq').Job} job
 */
async function processJob(job) {
  const taskId = parseJobTaskId(job);
  if (!taskId) {
    return;
  }

  let task;
  try {
    task = await getScheduledTask(taskId);
  } catch (error) {
    logger.error(`${LOG_PREFIX} Error loading task ${taskId}`, error);
    throw error;
  }

  if (!task) {
    logger.warn(`${LOG_PREFIX} Task ${taskId} not found, skipping job`);
    return;
  }

  if (task.status !== 'active') {
    logger.info(`${LOG_PREFIX} Task ${taskId} skipped (status=${task.status})`);
    return;
  }

  logger.info(`${LOG_PREFIX} Executing task ${taskId} for user ${task.userId}`);

  const res = buildResponseMock();
  const next = (error) => {
    if (error) {
      logger.error(`${LOG_PREFIX} Agent middleware error for task ${taskId}`, error);
    }
  };

  try {
    const req = await buildRequestFromTask(task, taskId);
    await AgentController(req, res, next, initializeClient, addTitle);
    await updateScheduledTask(taskId, { lastRunAt: new Date() }, task.userId);
    logger.info(`${LOG_PREFIX} Successfully executed task ${taskId}`);
  } catch (error) {
    logger.error(`${LOG_PREFIX} Error executing task ${taskId}`, error);
    throw error;
  }
}

module.exports = { processJob };
