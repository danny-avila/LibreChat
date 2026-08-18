const { buildSubagentThreadTaskConfig } = require('@librechat/api');
const { Constants } = require('librechat-data-provider');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const db = require('~/models');

const CHILD_VIEW_ONLY_ERROR =
  'This child thread is view-only. Continue it from its parent agent using the saved thread history.';
const CHILD_BUSY_ERROR =
  'This child thread is still running. Wait for it to settle before starting a user turn.';
const CHILD_AGENT_ERROR = 'This child thread can only be continued with its original saved agent.';

function rejectTurn(res, message) {
  return res.status(409).json({ error: message });
}

/**
 * Enforces durable child write policy for model-bound chat routes and holds the
 * same process-local lease used by parent-driven continuations. The Agents
 * controller retains that lease through its background generation; pre-controller
 * failures release it when the HTTP response closes. Ownership remains the
 * responsibility of validateConvoAccess, which must run first.
 */
async function guardSubagentThreadTurn(req, res, next) {
  const conversationId = req.body?.conversationId ?? req.body?.arg?.conversationId;
  if (!conversationId || conversationId === Constants.NEW_CONVO) {
    return next();
  }
  const rawUserId = req.user?.id ?? req.user?._id;
  if (rawUserId == null) {
    return next();
  }
  const userId = String(rawUserId);

  try {
    const conversation = await db.getConvo(userId, conversationId);
    const lineage = conversation?.subagentThread;
    if (conversation == null || lineage == null) {
      return next();
    }
    if (req.baseUrl !== '/api/agents/chat') {
      return rejectTurn(res, CHILD_AGENT_ERROR);
    }
    if (
      typeof req.body?.agent_id === 'string' &&
      typeof conversation.agent_id === 'string' &&
      req.body.agent_id !== conversation.agent_id
    ) {
      return rejectTurn(res, CHILD_AGENT_ERROR);
    }
    if (lineage.userRunnable !== true) {
      return rejectTurn(res, CHILD_VIEW_ONLY_ERROR);
    }

    const config = buildSubagentThreadTaskConfig(subagentThreadTaskStore, {
      userId,
      parentConversationId: lineage.parentConversationId,
      ...(typeof req.user?.tenantId === 'string' && req.user.tenantId !== ''
        ? { tenantId: req.user.tenantId }
        : {}),
    });
    const release = subagentThreadTaskStore.acquireUserTurn(config.scopeId, conversationId);
    if (release == null) {
      return rejectTurn(res, CHILD_BUSY_ERROR);
    }
    let released = false;
    let retainedByGeneration = false;
    const releaseOnce = () => {
      if (released) {
        return;
      }
      released = true;
      release();
    };
    req.subagentThreadTurnLease = {
      /** The Agents controller acknowledges before background generation
       * settles. Once admitted, it retains the lease beyond HTTP completion
       * and releases it from the actual generation lifecycle. */
      retain: () => {
        retainedByGeneration = true;
      },
      release: releaseOnce,
    };
    const releaseUnretained = () => {
      if (!retainedByGeneration) {
        releaseOnce();
      }
    };
    res.once('finish', releaseUnretained);
    res.once('close', releaseUnretained);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = guardSubagentThreadTurn;
