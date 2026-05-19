const { getConvo } = require('~/models');

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
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (conversation.user !== req.user.id) {
    return res.status(403).json({ error: 'User not authorized for this conversation' });
  }

  next();
};

module.exports = validateMessageReq;
