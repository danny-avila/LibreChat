const { GenerationJobManager, isPendingActionStale } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { getConvo } = require('~/models');

function hasTenantMismatch(job, user) {
  // Untenanted jobs remain readable by their owner for pre-multi-tenancy deployments.
  return job.metadata?.tenantId != null && job.metadata.tenantId !== user.tenantId;
}

async function canReadActiveJobConversation(req, conversationId) {
  if (req.method !== 'GET' || req.params?.messageId) {
    return false;
  }

  let job;
  try {
    job = await GenerationJobManager.getJob(conversationId);
  } catch (error) {
    logger.warn(`[validateMessageReq] Active job lookup failed for ${conversationId}:`, error);
    return false;
  }

  // A job paused for human review is still active (consistent with /chat/status
  // and /chat/active), so a new-conversation run that pauses before its final
  // save can still recover the prompt — but only while it has a live,
  // resolvable prompt (missing/malformed or past-expiry reads as inactive).
  const isActive =
    !!job &&
    (job.status === 'running' ||
      (job.status === 'requires_action' &&
        !isPendingActionStale({ pendingAction: job.metadata?.pendingAction })));
  if (!isActive) {
    return false;
  }

  return job.metadata?.userId === req.user.id && !hasTenantMismatch(job, req.user);
}

// Middleware to validate conversationId and user relationship
const validateMessageReq = async (req, res, next) => {
  const body = req.body ?? {};
  const paramConversationId = req.params?.conversationId;
  const bodyConversationId = body.conversationId;
  const nestedConversationId = body.message?.conversationId;

  if (
    (paramConversationId &&
      ((bodyConversationId && paramConversationId !== bodyConversationId) ||
        (nestedConversationId && paramConversationId !== nestedConversationId))) ||
    (bodyConversationId && nestedConversationId && bodyConversationId !== nestedConversationId)
  ) {
    return res.status(400).json({ error: 'Conversation ID mismatch' });
  }

  const conversationId = paramConversationId || bodyConversationId || nestedConversationId;

  if (conversationId === 'new') {
    return res.status(200).send([]);
  }

  const conversation = await getConvo(req.user.id, conversationId);

  if (!conversation) {
    if (await canReadActiveJobConversation(req, conversationId)) {
      return next();
    }

    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (conversation.user !== req.user.id) {
    return res.status(403).json({ error: 'User not authorized for this conversation' });
  }

  next();
};

module.exports = validateMessageReq;
