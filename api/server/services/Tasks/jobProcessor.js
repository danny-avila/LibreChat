const { logger } = require('@librechat/data-schemas');
const { getScheduledTask, updateScheduledTask, saveConvo } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const addTitle = require('~/server/services/Endpoints/agents/title');

/**
 * Builds a request-like object that AgentController can consume from a
 * scheduled-task definition. Each run starts a fresh conversation so background
 * runs never mutate the user's interactive chats.
 */
function buildRequestFromTask(task, taskId) {
  const payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
  const {
    text,
    isTemporary,
    endpointOption: payloadEndpointOption,
    ephemeralAgent,
    agent_id: payloadAgentId,
    ...restPayload
  } = payload;

  const agentId = task.targetType === 'agent' ? task.targetId : payloadAgentId;

  return {
    user: { id: task.userId },
    body: {
      ...restPayload,
      text: text || 'Scheduled Task Execution',
      conversationId: 'new',
      isTemporary: isTemporary === true,
      ephemeralAgent,
      endpointOption: payloadEndpointOption || {},
      agent_id: agentId,
    },
    scheduledTaskMeta: { taskId, isScheduled: true },
    config: { interfaceConfig: {} },
  };
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

  const req = buildRequestFromTask(task, taskId);
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
