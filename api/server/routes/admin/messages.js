const express = require('express');
const mongoose = require('mongoose');
const { logger, AdminAuditActions } = require('@librechat/data-schemas');
const {
  requireJwtAuth,
  checkBan,
  checkAdmin,
  adminRateLimiter,
  checkAdminIpAllowlist,
  auditLogger,
} = require('~/server/middleware');
const { AdminAuditLog } = require('~/db/models');
const messagesService = require('~/server/services/admin/messages');

const router = express.Router();

router.use(requireJwtAuth, checkBan, checkAdmin, checkAdminIpAllowlist, adminRateLimiter);

const MESSAGE_ID_PATTERN = /^[A-Za-z0-9._-]{1,256}$/;

function rejectInvalidUserId(req, res) {
  const { userId } = req.params;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
    return true;
  }
  return false;
}

function rejectInvalidConversationId(req, res) {
  const { conversationId } = req.params;
  if (
    typeof conversationId !== 'string' ||
    conversationId.length < 1 ||
    conversationId.length > 256
  ) {
    res.status(400).json({
      message: 'Invalid conversation id',
      code: 'INVALID_CONVERSATION_ID',
    });
    return true;
  }
  return false;
}

function rejectInvalidMessageId(req, res) {
  const { messageId } = req.params;
  if (
    typeof messageId !== 'string' ||
    messageId.length < 1 ||
    messageId.length > 256 ||
    !MESSAGE_ID_PATTERN.test(messageId)
  ) {
    res.status(400).json({ message: 'Invalid message id', code: 'INVALID_MESSAGE_ID' });
    return true;
  }
  return false;
}

/**
 * Best-effort post-response audit writer used when the action constant
 * depends on the request (e.g., includeContent toggling).
 */
function writeAuditAfterResponse(req, res, { action, targetType, targetId, meta }) {
  res.on('finish', () => {
    (async () => {
      try {
        const actorId = req.user?._id || req.user?.id || null;
        if (!actorId) return;
        const status = res.statusCode < 400 ? 'success' : 'failure';
        await AdminAuditLog.create({
          actorId,
          actorEmail: req.user?.email || '',
          actorIp: req.ip || null,
          userAgent: req.headers?.['user-agent'] || null,
          action,
          targetType,
          targetId: targetId ?? null,
          meta: meta ?? null,
          status,
        });
      } catch (err) {
        try {
          logger.error('[admin messages audit] write failed', err);
        } catch (_e) {
          /* swallow */
        }
      }
    })();
  });
}

// GET /api/admin/messages/users/:userId/conversations
router.get(
  '/users/:userId/conversations',
  auditLogger(AdminAuditActions.CONVERSATION_VIEW, {
    targetType: 'conversation',
    getTargetId: (req) => req.params.userId,
    getMeta: (req) => ({
      page: req.query?.page || null,
      limit: req.query?.limit || null,
      scope: 'list',
    }),
  }),
  async (req, res) => {
    if (rejectInvalidUserId(req, res)) return;
    try {
      const result = await messagesService.listConversationsForUser(req.params.userId, {
        page: req.query?.page,
        limit: req.query?.limit,
      });
      return res.status(200).json(result);
    } catch (err) {
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
      }
      logger.error('[admin GET /messages/users/:userId/conversations] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// GET /api/admin/messages/users/:userId/conversations/:conversationId
router.get(
  '/users/:userId/conversations/:conversationId',
  auditLogger(AdminAuditActions.CONVERSATION_VIEW, {
    targetType: 'conversation',
    getTargetId: (req) => req.params.conversationId,
    getMeta: (req) => ({ userId: req.params.userId, scope: 'single' }),
  }),
  async (req, res) => {
    if (rejectInvalidUserId(req, res)) return;
    if (rejectInvalidConversationId(req, res)) return;
    try {
      const result = await messagesService.getConversation(
        req.params.userId,
        req.params.conversationId,
      );
      return res.status(200).json(result);
    } catch (err) {
      if (err.code === 'INVALID_USER_ID') {
        return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
      }
      if (err.code === 'INVALID_CONVERSATION_ID') {
        return res
          .status(400)
          .json({ message: 'Invalid conversation id', code: 'INVALID_CONVERSATION_ID' });
      }
      if (err.code === 'CONVERSATION_NOT_FOUND') {
        return res
          .status(404)
          .json({ message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
      }
      logger.error('[admin GET /messages/users/:userId/conversations/:conversationId] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

// GET /api/admin/messages/users/:userId/conversations/:conversationId/messages
// Manual audit: action depends on includeContent.
router.get('/users/:userId/conversations/:conversationId/messages', async (req, res) => {
  if (rejectInvalidUserId(req, res)) return;
  if (rejectInvalidConversationId(req, res)) return;

  const includeContent = req.query?.includeContent === 'true';
  const action = includeContent
    ? AdminAuditActions.MESSAGES_VIEW_CONTENT
    : AdminAuditActions.MESSAGES_VIEW_LIST;

  try {
    const result = await messagesService.listMessages(
      req.params.userId,
      req.params.conversationId,
      {
        page: req.query?.page,
        limit: req.query?.limit,
        includeContent,
      },
    );

    // Write a single audit row per page after response is sent.
    writeAuditAfterResponse(req, res, {
      action,
      targetType: 'message',
      targetId: req.params.conversationId,
      meta: {
        conversationId: req.params.conversationId,
        messageCount: result.items.length,
        includeContent,
        page: result.page,
        limit: result.limit,
      },
    });

    return res.status(200).json(result);
  } catch (err) {
    // Still audit failures with the same chosen action.
    writeAuditAfterResponse(req, res, {
      action,
      targetType: 'message',
      targetId: req.params.conversationId,
      meta: {
        conversationId: req.params.conversationId,
        messageCount: 0,
        includeContent,
      },
    });

    if (err.code === 'INVALID_USER_ID') {
      return res.status(400).json({ message: 'Invalid user id', code: 'INVALID_USER_ID' });
    }
    if (err.code === 'INVALID_CONVERSATION_ID') {
      return res
        .status(400)
        .json({ message: 'Invalid conversation id', code: 'INVALID_CONVERSATION_ID' });
    }
    if (err.code === 'CONVERSATION_NOT_FOUND') {
      return res
        .status(404)
        .json({ message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' });
    }
    logger.error('[admin GET messages list] error', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /api/admin/messages/messages/:messageId
router.get(
  '/messages/:messageId',
  auditLogger(AdminAuditActions.MESSAGES_VIEW_CONTENT, {
    targetType: 'message',
    getTargetId: (req) => req.params.messageId,
    getMeta: (_req, res) => {
      const m = res.locals?.fetchedMessage;
      return {
        messageId: m?.messageId || null,
        conversationId: m?.conversationId || null,
      };
    },
  }),
  async (req, res) => {
    if (rejectInvalidMessageId(req, res)) return;
    try {
      const msg = await messagesService.getMessage(req.params.messageId);
      res.locals.fetchedMessage = msg;
      return res.status(200).json(msg);
    } catch (err) {
      if (err.code === 'INVALID_MESSAGE_ID') {
        return res.status(400).json({ message: 'Invalid message id', code: 'INVALID_MESSAGE_ID' });
      }
      if (err.code === 'MESSAGE_NOT_FOUND') {
        return res.status(404).json({ message: 'Message not found', code: 'MESSAGE_NOT_FOUND' });
      }
      logger.error('[admin GET /messages/:messageId] error', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

module.exports = router;
