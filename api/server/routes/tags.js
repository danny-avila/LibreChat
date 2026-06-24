const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  updateTagsForConversation,
  updateConversationTag,
  createConversationTag,
  deleteConversationTag,
  getConversationTags,
  applyForcedRetention,
  applyForcedRetentionToTag,
  getRoleByName,
} = require('~/models');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();

const checkBookmarkAccess = generateCheckAccess({
  permissionType: PermissionTypes.BOOKMARKS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(checkBookmarkAccess);

/**
 * Enforces forced (ephemeral) retention after a bookmark-tag write converts an older
 * permanent conversation; a no-op outside forced retention.
 */
const enforceForcedRetention = (req, conversationId, context) =>
  applyForcedRetention(
    { userId: req?.user?.id, interfaceConfig: req?.config?.interfaceConfig },
    { conversationId },
    { context },
  );

/**
 * Enforces forced (ephemeral) retention on every conversation carrying a tag, for global
 * tag renames/deletes that rewrite conversation rows without converting them; a no-op
 * outside forced retention.
 */
const enforceForcedRetentionForTag = (req, tag, context) =>
  applyForcedRetentionToTag(
    { userId: req?.user?.id, interfaceConfig: req?.config?.interfaceConfig },
    { tag },
    { context },
  );

/**
 * GET /
 * Retrieves all conversation tags for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
router.get('/', async (req, res) => {
  try {
    const tags = await getConversationTags(req.user.id);
    if (tags) {
      res.status(200).json(tags);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    logger.error('Error getting conversation tags:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /
 * Creates a new conversation tag for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
router.post('/', configMiddleware, async (req, res) => {
  try {
    const tag = await createConversationTag(req.user.id, req.body);
    if (req.body?.addToConversation && req.body?.conversationId) {
      await enforceForcedRetention(req, req.body.conversationId, 'POST /api/tags');
    }
    res.status(200).json(tag);
  } catch (error) {
    logger.error('Error creating conversation tag:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /:tag
 * Updates an existing conversation tag for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
router.put('/:tag', configMiddleware, async (req, res) => {
  try {
    const decodedTag = decodeURIComponent(req.params.tag);
    const tag = await updateConversationTag(req.user.id, decodedTag, req.body);
    if (tag) {
      const renamedTag = typeof req.body?.tag === 'string' ? req.body.tag : decodedTag;
      await enforceForcedRetentionForTag(req, renamedTag, 'PUT /api/tags/:tag');
      res.status(200).json(tag);
    } else {
      res.status(404).json({ error: 'Tag not found' });
    }
  } catch (error) {
    logger.error('Error updating conversation tag:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /:tag
 * Deletes a conversation tag for the authenticated user.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
router.delete('/:tag', configMiddleware, async (req, res) => {
  try {
    const decodedTag = decodeURIComponent(req.params.tag);
    await enforceForcedRetentionForTag(req, decodedTag, 'DELETE /api/tags/:tag');
    const tag = await deleteConversationTag(req.user.id, decodedTag);
    if (tag) {
      res.status(200).json(tag);
    } else {
      res.status(404).json({ error: 'Tag not found' });
    }
  } catch (error) {
    logger.error('Error deleting conversation tag:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /convo/:conversationId
 * Updates the tags for a conversation.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
router.put('/convo/:conversationId', configMiddleware, async (req, res) => {
  try {
    const conversationTags = await updateTagsForConversation(
      req.user.id,
      req.params.conversationId,
      req.body.tags,
    );
    await enforceForcedRetention(
      req,
      req.params.conversationId,
      'PUT /api/tags/convo/:conversationId',
    );
    res.status(200).json(conversationTags);
  } catch (error) {
    logger.error('Error updating conversation tags', error);
    res.status(500).send('Error updating conversation tags');
  }
});

module.exports = router;
