const { logger } = require('@librechat/data-schemas');
const { getScheduledTask, updateScheduledTask } = require('~/models');
const AgentController = require('~/server/controllers/agents/request');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const addTitle = require('~/server/services/Endpoints/agents/title');

const processJob = async (job) => {
  const { taskId } = job.data;
  
  try {
    const task = await getScheduledTask(taskId);
    if (!task) {
      logger.error(`Scheduled task not found: ${taskId}`);
      return;
    }

    if (task.status !== 'active') {
      logger.info(`Scheduled task ${taskId} is not active. Status: ${task.status}`);
      return;
    }

    logger.info(`Executing scheduled task ${taskId} for user ${task.userId}`);

    // Construct a mock req and res for the AgentController
    const req = {
      user: { id: task.userId },
      body: {
        text: task.payload.text || 'Scheduled Task Execution',
        conversationId: 'new', // Or a specific conversation if we want to thread them
        endpointOption: task.payload.endpointOption || {},
        agent_id: task.targetType === 'agent' ? task.targetId : undefined,
        // Add other necessary payload fields
        ...task.payload,
      },
      config: {
        interfaceConfig: {}, // Mock config if needed
      },
    };

    const res = {
      on: () => {},
      removeListener: () => {},
      json: (data) => {
        logger.debug(`[JobProcessor] res.json called with: ${JSON.stringify(data)}`);
      },
      end: () => {
        logger.debug(`[JobProcessor] res.end called`);
      },
      write: () => true,
      headersSent: false,
      finished: false,
    };

    // We don't need a real next function
    const next = (err) => {
      if (err) {
        logger.error(`[JobProcessor] next called with error:`, err);
      }
    };

    // Execute the agent controller
    await AgentController(req, res, next, initializeClient, addTitle);

    // Update lastRunAt
    await updateScheduledTask(taskId, { lastRunAt: new Date() });

    logger.info(`Successfully executed scheduled task ${taskId}`);
  } catch (error) {
    logger.error(`Error processing scheduled task ${taskId}:`, error);
    throw error; // Let bullmq handle the failure
  }
};

module.exports = { processJob };
