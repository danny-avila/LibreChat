const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger, EModelEndpoint, Constants } = require('@librechat/data-schemas');
const {
  shareConversationWithUsers,
  revokeConversationShare,
  getConversationShares,
  getSharedConversations,
  hasSharedAccess,
} = require('~/models');
const { getConvo } = require('~/models/Conversation');
const { getMessages } = require('~/models/Message');
const { createImportBatchBuilder } = require('~/server/utils/import/importBatchBuilder');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

/**
 * Get all conversations shared with the current user
 * GET /api/shared-conversations
 */
router.get('/', async (req, res) => {
  try {
    const cursor = req.query.cursor ? new Date(req.query.cursor) : undefined;
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 25));

    const result = await getSharedConversations(req.user.id, cursor, pageSize);

    res.status(200).json({
      shares: result.shares,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    });
  } catch (error) {
    logger.error('Error getting shared conversations:', error);
    res.status(500).json({
      message: 'Error getting shared conversations',
      error: error.message,
    });
  }
});

/**
 * Get users a conversation is shared with
 * GET /api/shared-conversations/:conversationId/users
 */
router.get('/:conversationId/users', async (req, res) => {
  try {
    const result = await getConversationShares(req.user.id, req.params.conversationId);

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error getting conversation shares:', error);
    res.status(500).json({
      message: 'Error getting conversation shares',
      error: error.message,
    });
  }
});

/**
 * Get a shared conversation (for recipients)
 * GET /api/shared-conversations/:conversationId
 */
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Check if user has shared access
    const accessResult = await hasSharedAccess(req.user.id, conversationId);
    if (!accessResult.hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get the conversation from the owner
    const conversation = await getConvo(accessResult.ownerId, conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Mark it as shared for the frontend
    res.status(200).json({
      ...conversation,
      isSharedWithUser: true,
      sharedByUserId: accessResult.ownerId,
    });
  } catch (error) {
    logger.error('Error getting shared conversation:', error);
    res.status(500).json({ message: 'Error getting shared conversation' });
  }
});

/**
 * Get messages for a shared conversation (for recipients)
 * GET /api/shared-conversations/:conversationId/messages
 */
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Check if user has shared access
    const accessResult = await hasSharedAccess(req.user.id, conversationId);
    if (!accessResult.hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get messages from the owner's conversation
    const messages = await getMessages({
      user: accessResult.ownerId,
      conversationId,
    });

    res.status(200).json(messages);
  } catch (error) {
    logger.error('Error getting shared conversation messages:', error);
    res.status(500).json({ message: 'Error getting shared conversation messages' });
  }
});

/**
 * Share a conversation with users
 * POST /api/shared-conversations/:conversationId/share
 */
router.post('/:conversationId/share', async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds array is required' });
    }

    const result = await shareConversationWithUsers(
      req.user.id,
      req.params.conversationId,
      userIds,
      { name: req.user.name, email: req.user.email },
    );

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error sharing conversation:', error);
    res.status(500).json({
      message: 'Error sharing conversation',
      error: error.message,
    });
  }
});

/**
 * Revoke sharing access for users
 * POST /api/shared-conversations/:conversationId/revoke
 */
router.post('/:conversationId/revoke', async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds array is required' });
    }

    const result = await revokeConversationShare(
      req.user.id,
      req.params.conversationId,
      userIds,
    );

    res.status(200).json(result);
  } catch (error) {
    logger.error('Error revoking conversation share:', error);
    res.status(500).json({
      message: 'Error revoking conversation share',
      error: error.message,
    });
  }
});

/**
 * Fork a shared conversation (for recipients)
 * POST /api/shared-conversations/:conversationId/fork
 */
router.post('/:conversationId/fork', async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Check if user has shared access
    const accessResult = await hasSharedAccess(req.user.id, conversationId);
    if (!accessResult.hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get the original conversation from the owner
    const originalConvo = await getConvo(accessResult.ownerId, conversationId);
    if (!originalConvo) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Get the messages from the owner's conversation
    const originalMessages = await getMessages({
      user: accessResult.ownerId,
      conversationId,
    });

    if (!originalMessages || originalMessages.length === 0) {
      return res.status(404).json({ message: 'No messages to fork' });
    }

    // Create a new conversation for the requesting user with cloned messages
    const importBatchBuilder = createImportBatchBuilder(req.user.id);
    importBatchBuilder.startConversation(originalConvo.endpoint ?? EModelEndpoint.openAI);

    // Clone messages with new IDs
    const idMapping = new Map();
    const sortedMessages = [...originalMessages].sort((a, b) => {
      if (a.parentMessageId === Constants.NO_PARENT) return -1;
      if (b.parentMessageId === Constants.NO_PARENT) return 1;
      return 0;
    });

    for (const message of sortedMessages) {
      const newMessageId = uuidv4();
      idMapping.set(message.messageId, newMessageId);

      const parentId =
        message.parentMessageId && message.parentMessageId !== Constants.NO_PARENT
          ? idMapping.get(message.parentMessageId)
          : Constants.NO_PARENT;

      const clonedMessage = {
        ...message,
        messageId: newMessageId,
        parentMessageId: parentId,
        createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
      };

      importBatchBuilder.saveMessage(clonedMessage);
    }

    const result = importBatchBuilder.finishConversation(
      originalConvo.title,
      new Date(),
      originalConvo,
    );
    await importBatchBuilder.saveBatch();

    logger.debug(
      `user: ${req.user.id} | Forked shared conversation "${originalConvo.title}" from owner ${accessResult.ownerId}`,
    );

    // Get the newly created conversation and messages
    const conversation = await getConvo(req.user.id, result.conversation.conversationId);
    const messages = await getMessages({
      user: req.user.id,
      conversationId: conversation.conversationId,
    });

    res.status(200).json({
      conversation,
      messages,
    });
  } catch (error) {
    logger.error('Error forking shared conversation:', error);
    res.status(500).json({
      message: 'Error forking shared conversation',
      error: error.message,
    });
  }
});

/**
 * Check if user has access to a shared conversation
 * GET /api/shared-conversations/:conversationId/access
 */
router.get('/:conversationId/access', async (req, res) => {
  try {
    const result = await hasSharedAccess(req.user.id, req.params.conversationId);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error checking shared access:', error);
    res.status(500).json({ message: 'Error checking shared access' });
  }
});

module.exports = router;
