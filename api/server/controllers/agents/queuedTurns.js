const {
  handleAgentQueuedTurnEnqueue,
  handleAgentQueuedTurnList,
  handleAgentQueuedTurnCancel,
  AGENT_QUEUED_TURN_SOURCE,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const db = require('~/models');
const { createAgentAccessCheck } = require('./steer');
const dependencies = (req) => {
  /** Keep trigger-service composition lazy so importing the route for unrelated
   * middleware probes does not initialize or require the worker graph. */
  const {
    scheduleAgentQueuedTurn,
    getAgentTriggerDelivery,
    retireAgentTrigger,
  } = require('~/server/services/Agents/triggers');
  return {
    methods: db,
    scheduler: { schedule: scheduleAgentQueuedTurn },
    getFiles: db.getFiles,
    updateFilesUsage: db.updateFilesUsage,
    checkAgentAccess: createAgentAccessCheck(req),
    isPrincipalActive: db.isAgentTriggerPrincipalActive,
    retireDelivery: (deliveryKey, _sourceId, reason, options) =>
      retireAgentTrigger(deliveryKey, AGENT_QUEUED_TURN_SOURCE, reason, options),
    getDelivery: getAgentTriggerDelivery,
  };
};

const send = (res, result) => res.status(result.status).json(result.body);

const AgentQueuedTurnEnqueueController = async (req, res) => {
  try {
    return send(
      res,
      await handleAgentQueuedTurnEnqueue(req.user ?? {}, req.body ?? {}, dependencies(req)),
    );
  } catch (error) {
    logger.error('[AgentQueuedTurns] Failed to enqueue turn', error);
    return res.status(500).json({ code: 'QUEUED_TURN_FAILED' });
  }
};

const AgentQueuedTurnListController = async (req, res) => {
  try {
    return send(
      res,
      await handleAgentQueuedTurnList(
        req.user ?? {},
        req.query?.conversationId,
        dependencies(req),
        req.query?.clientRequestIds,
      ),
    );
  } catch (error) {
    logger.error('[AgentQueuedTurns] Failed to list turns', error);
    return res.status(500).json({ code: 'QUEUED_TURN_LIST_FAILED' });
  }
};

const AgentQueuedTurnCancelController = async (req, res) => {
  try {
    return send(
      res,
      await handleAgentQueuedTurnCancel(
        req.user ?? {},
        req.params?.queuedTurnId,
        dependencies(req),
      ),
    );
  } catch (error) {
    logger.error('[AgentQueuedTurns] Failed to cancel turn', error);
    return res.status(500).json({ code: 'QUEUED_TURN_CANCEL_FAILED' });
  }
};

module.exports = {
  AgentQueuedTurnEnqueueController,
  AgentQueuedTurnListController,
  AgentQueuedTurnCancelController,
};
