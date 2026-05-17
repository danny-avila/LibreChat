const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { getScheduledTask, updateScheduledTask, saveConvo, getUserById } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');
const { initializeClient, buildOptions } = require('~/server/services/Endpoints/agents');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getAppConfig } = require('~/server/services/Config');

/**
 * Builds a request-like object that AgentController can consume from a
 * scheduled-task definition. Each run starts a fresh conversation so background
 * runs never mutate the user's interactive chats.
 *
 * For `targetType: 'model'` tasks we mirror the chat ephemeral-agent flow:
 * `endpoint` + `model` from the task payload populate `req.body`, and
 * `buildOptions` synthesizes the same `endpointOption` shape that
 * `buildEndpointOption` middleware would produce for an interactive run.
 */
async function buildRequestFromTask(task, taskId) {
  const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
  const {
    text,
    isTemporary,
    endpoint: payloadEndpoint,
    model: payloadModel,
    endpointOption: payloadEndpointOption,
    ephemeralAgent,
    agent_id: payloadAgentId,
    ...restPayload
  } = payload;

  const isModelTarget = task.targetType === 'model';
  const endpoint = isModelTarget ? payloadEndpoint : restPayload.endpoint;
  const model = isModelTarget ? payloadModel : restPayload.model;
  const agentId = isModelTarget
    ? Constants.EPHEMERAL_AGENT_ID
    : task.targetType === 'agent'
      ? task.targetId
      : payloadAgentId;

  let userRecord = null;
  try {
    userRecord = await getUserById(task.userId, '-password');
  } catch (err) {
    logger.warn(`[JobProcessor] Failed to fetch user ${task.userId}:`, err);
  }

  const appConfig = await getAppConfig({
    role: userRecord?.role,
    tenantId: userRecord?.tenantId,
  }).catch((err) => {
    logger.warn('[JobProcessor] Failed to resolve appConfig, continuing with empty config', err);
    return null;
  });

  const req = {
    user: userRecord ? { ...userRecord, id: task.userId } : { id: task.userId },
    config: appConfig || { interfaceConfig: {} },
    body: {
      ...restPayload,
      text: text || 'Scheduled Task Execution',
      conversationId: 'new',
      isTemporary: isTemporary === true,
      ephemeralAgent,
      endpointOption: payloadEndpointOption || {},
      agent_id: agentId,
      endpoint,
      model,
    },
    scheduledTaskMeta: { taskId, isScheduled: true },
  };

  if (isModelTarget && endpoint) {
    try {
      const builtOption = await buildOptions(req, endpoint, { ...req.body, agent_id: agentId });
      req.body.endpointOption = builtOption;
    } catch (err) {
      logger.error(
        `[JobProcessor] Failed to build endpoint option for task ${taskId} (endpoint=${endpoint}):`,
        err,
      );
      throw err;
    }
  }

  return req;
}

function buildResponseMock() {
  return {
    on: () => {},
    removeListener: () => {},
    json: () => {},
    end: () => {},
    write: () => true,
    setHeader: () => {},
    status: function status() {
      return this;
    },
    send: () => {},
    headersSent: false,
    finished: false,
  };
}

const processJob = async (job) => {
  const { taskId } = job.data;

  let task;
  try {
    task = await getScheduledTask(taskId);
  } catch (error) {
    logger.error(`[JobProcessor] Failed to load scheduled task ${taskId}:`, error);
    throw error;
  }

  if (!task) {
    logger.error(`Scheduled task not found: ${taskId}`);
    return;
  }
  if (task.status !== 'active') {
    logger.info(`Scheduled task ${taskId} is not active. Status: ${task.status}`);
    return;
  }

  logger.info(`Executing scheduled task ${taskId} for user ${task.userId}`);

  const req = await buildRequestFromTask(task, taskId);
  const res = buildResponseMock();
  const next = (err) => {
    if (err) {
      logger.error('[JobProcessor] next called with error:', err);
    }
  };

  try {
    await AgentController(req, res, next, initializeClient, addTitle);

    const conversationId = req.body.conversationId;
    if (conversationId && conversationId !== 'new' && req.body.isTemporary !== true) {
      try {
        await saveConvo(
          { userId: task.userId },
          { conversationId, isScheduled: true, taskId },
          {
            context: 'jobProcessor - mark scheduled run',
            noUpsert: true,
          },
        );
      } catch (err) {
        logger.error(
          `[JobProcessor] Failed to tag conversation ${conversationId} for task ${taskId}:`,
          err,
        );
      }
    }

    await updateScheduledTask(taskId, { lastRunAt: new Date() }, task.userId);
    logger.info(`Successfully executed scheduled task ${taskId}`);
  } catch (error) {
    logger.error(`Error processing scheduled task ${taskId}:`, error);
    throw error;
  }
};

module.exports = { processJob };
