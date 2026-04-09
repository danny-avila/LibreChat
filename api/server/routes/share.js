const mongoose = require('mongoose');
const express = require('express');
const { isEnabled, createTempChatExpirationDate } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { RetentionMode } = require('librechat-data-provider');
const {
  getSharedMessages,
  createSharedLink,
  updateSharedLink,
  deleteSharedLink,
  getSharedLinks,
  getSharedLink,
} = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const router = express.Router();

/**
 * Shared messages
 */
const allowSharedLinks =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

if (allowSharedLinks) {
  const allowSharedLinksPublic = isEnabled(process.env.ALLOW_SHARED_LINKS_PUBLIC);
  router.get(
    '/:shareId',
    allowSharedLinksPublic ? (req, res, next) => next() : requireJwtAuth,
    async (req, res) => {
      try {
        const share = await getSharedMessages(req.params.shareId);

        if (share) {
          res.status(200).json(share);
        } else {
          res.status(404).end();
        }
      } catch (error) {
        logger.error('Error getting shared messages:', error);
        res.status(500).json({ message: 'Error getting shared messages' });
      }
    },
  );
}

/**
 * Shared links
 */
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const params = {
      pageParam: req.query.cursor,
      pageSize: Math.max(1, parseInt(req.query.pageSize) || 10),
      isPublic: isEnabled(req.query.isPublic),
      sortBy: ['createdAt', 'title'].includes(req.query.sortBy) ? req.query.sortBy : 'createdAt',
      sortDirection: ['asc', 'desc'].includes(req.query.sortDirection)
        ? req.query.sortDirection
        : 'desc',
      search: req.query.search ? decodeURIComponent(req.query.search.trim()) : undefined,
    };

    const result = await getSharedLinks(
      req.user.id,
      params.pageParam,
      params.pageSize,
      params.isPublic,
      params.sortBy,
      params.sortDirection,
      params.search,
    );

    res.status(200).send({
      links: result.links,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    });
  } catch (error) {
    logger.error('Error getting shared links:', error);
    res.status(500).json({
      message: 'Error getting shared links',
      error: error.message,
    });
  }
});

router.get('/link/:conversationId', requireJwtAuth, async (req, res) => {
  try {
    const share = await getSharedLink(req.user.id, req.params.conversationId);

    return res.status(200).json({
      success: share.success,
      shareId: share.shareId,
      conversationId: req.params.conversationId,
    });
  } catch (error) {
    logger.error('Error getting shared link:', error);
    res.status(500).json({ message: 'Error getting shared link' });
  }
});

router.post('/:conversationId', requireJwtAuth, async (req, res) => {
  try {
    const { targetMessageId } = req.body;
    let expiredAt;
    const isRetentionAll = req?.config?.interfaceConfig?.retentionMode === RetentionMode.ALL;
    let isConvoTemporary = false;
    if (!isRetentionAll) {
      const Conversation = mongoose.models.Conversation;
      const convo = await Conversation.findOne(
        { conversationId: req.params.conversationId, user: req.user.id },
        'isTemporary expiredAt',
      ).lean();
      isConvoTemporary =
        convo?.isTemporary === true || (convo?.isTemporary == null && convo?.expiredAt != null);
    }
    if (isRetentionAll || isConvoTemporary) {
      try {
        expiredAt = createTempChatExpirationDate(req.config?.interfaceConfig);
      } catch (err) {
        logger.error('Error creating shared link expiration date:', err);
      }
    }
    const created = await createSharedLink(
      req.user.id,
      req.params.conversationId,
      targetMessageId,
      expiredAt,
    );
    if (created) {
      res.status(200).json(created);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    logger.error('Error creating shared link:', error);
    res.status(500).json({ message: 'Error creating shared link' });
  }
});

router.patch('/:shareId', requireJwtAuth, async (req, res) => {
  try {
    let expiredAt;
    const isRetentionAll = req?.config?.interfaceConfig?.retentionMode === RetentionMode.ALL;
    if (isRetentionAll) {
      try {
        expiredAt = createTempChatExpirationDate(req.config?.interfaceConfig);
      } catch (err) {
        logger.error('Error creating shared link expiration date:', err);
      }
    } else {
      const SharedLink = mongoose.models.SharedLink;
      const existing = await SharedLink.findOne(
        { shareId: req.params.shareId, user: req.user.id },
        'conversationId',
      ).lean();
      if (existing) {
        const Conversation = mongoose.models.Conversation;
        const convo = await Conversation.findOne(
          { conversationId: existing.conversationId, user: req.user.id },
          'isTemporary expiredAt',
        ).lean();
        const isConvoTemporary =
          convo?.isTemporary === true || (convo?.isTemporary == null && convo?.expiredAt != null);
        if (isConvoTemporary) {
          try {
            expiredAt = createTempChatExpirationDate(req.config?.interfaceConfig);
          } catch (err) {
            logger.error('Error creating shared link expiration date:', err);
          }
        }
      }
    }
    const updatedShare = await updateSharedLink(req.user.id, req.params.shareId, expiredAt);
    if (updatedShare) {
      res.status(200).json(updatedShare);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    logger.error('Error updating shared link:', error);
    res.status(500).json({ message: 'Error updating shared link' });
  }
});

router.delete('/:shareId', requireJwtAuth, async (req, res) => {
  try {
    const result = await deleteSharedLink(req.user.id, req.params.shareId);

    if (!result) {
      return res.status(404).json({ message: 'Share not found' });
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error deleting shared link:', error);
    return res.status(400).json({ message: 'Error deleting shared link' });
  }
});

module.exports = router;
