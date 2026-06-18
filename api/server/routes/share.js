const mongoose = require('mongoose');
const express = require('express');
const {
  isEnabled,
  generateCheckAccess,
  grantCreationPermissions,
  ensureLinkPermissions,
  deleteSharedLinkWithCleanup,
  updateSharedLinkPermissionsExpiration,
  isActiveExpirationDate,
  getSharedLinkExpiration,
} = require('@librechat/api');
const { logger, createTempChatExpirationDate } = require('@librechat/data-schemas');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getSharedMessages,
  createSharedLink,
  updateSharedLink,
  getSharedLinks,
  getSharedLink,
  getRoleByName,
} = require('~/models');
const canAccessSharedLink = require('~/server/middleware/canAccessSharedLink');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const router = express.Router();

const checkSharedLinksAccess = generateCheckAccess({
  permissionType: PermissionTypes.SHARED_LINKS,
  permissions: [Permissions.CREATE],
  getRoleByName,
});

const resolveSharedLinkExpiration = (req, conversationId) =>
  getSharedLinkExpiration(
    { req, conversationId },
    {
      getConvo: async (userId, sourceConversationId) => {
        const Conversation = mongoose.models.Conversation;
        return Conversation.findOne(
          { conversationId: sourceConversationId, user: userId },
          'isTemporary expiredAt',
        ).lean();
      },
      createExpirationDate: createTempChatExpirationDate,
      logger,
    },
  );

/**
 * Shared messages
 */
const allowSharedLinks =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

if (allowSharedLinks) {
  router.get('/:shareId', optionalJwtAuth, canAccessSharedLink, async (req, res) => {
    try {
      const share = await getSharedMessages(req.params.shareId, req.shareResourceId);
      if (share) {
        res.set('Cache-Control', 'private, no-store');
        res.status(200).json(share);
      } else {
        res.status(404).end();
      }
    } catch (error) {
      logger.error('Error getting shared messages:', error);
      res.status(500).json({ message: 'Error getting shared messages' });
    }
  });
}

/**
 * Shared links
 */
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const params = {
      pageParam: req.query.cursor,
      pageSize: Math.max(1, parseInt(req.query.pageSize) || 10),
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

    if (share._id && share.success) {
      await ensureLinkPermissions(share._id, req.user.id);
    }

    return res.status(200).json({
      _id: share._id,
      success: share.success,
      shareId: share.shareId,
      targetMessageId: share.targetMessageId,
      conversationId: req.params.conversationId,
    });
  } catch (error) {
    logger.error('Error getting shared link:', error);
    res.status(500).json({ message: 'Error getting shared link' });
  }
});

router.post('/:conversationId', requireJwtAuth, checkSharedLinksAccess, async (req, res) => {
  try {
    const { targetMessageId } = req.body;
    const expiredAt = await resolveSharedLinkExpiration(req, req.params.conversationId);
    if (expiredAt != null && !isActiveExpirationDate(expiredAt)) {
      return res.status(404).end();
    }

    const role = await getRoleByName(req.user.role);
    const sharedLinksPerms = role?.permissions?.[PermissionTypes.SHARED_LINKS] || {};
    const grantPublic = sharedLinksPerms[Permissions.SHARE_PUBLIC] === true;

    const created = await createSharedLink(
      req.user.id,
      req.params.conversationId,
      targetMessageId,
      expiredAt,
    );
    if (created) {
      await grantCreationPermissions(created._id, req.user.id, grantPublic, expiredAt);
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
    const { targetMessageId } = req.body ?? {};
    if (targetMessageId !== undefined && typeof targetMessageId !== 'string') {
      return res.status(400).json({ message: 'targetMessageId must be a string' });
    }

    let expiredAt;
    const SharedLink = mongoose.models.SharedLink;
    const existing = await SharedLink.findOne(
      { shareId: req.params.shareId, user: req.user.id },
      'conversationId',
    ).lean();
    if (existing?.conversationId) {
      expiredAt = await resolveSharedLinkExpiration(req, existing.conversationId);
    }
    if (expiredAt != null && !isActiveExpirationDate(expiredAt)) {
      return res.status(404).end();
    }

    const updatedShare = await updateSharedLink(
      req.user.id,
      req.params.shareId,
      targetMessageId,
      expiredAt,
    );
    if (updatedShare) {
      if (updatedShare._id && expiredAt !== undefined) {
        await updateSharedLinkPermissionsExpiration(updatedShare._id, expiredAt);
      }
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
    const result = await deleteSharedLinkWithCleanup(req.user.id, req.params.shareId);

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
