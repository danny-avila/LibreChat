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
  getRoleByName,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const checkBookmarkAccess = generateCheckAccess({
  permissionType: PermissionTypes.BOOKMARKS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(checkBookmarkAccess);

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
router.post('/', async (req, res) => {
  try {
    const tag = await createConversationTag(req.user.id, req.body);
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
router.put('/:tag', async (req, res) => {
  try {
    const decodedTag = decodeURIComponent(req.params.tag);
    const tag = await updateConversationTag(req.user.id, decodedTag, req.body);
    if (tag) {
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
router.delete('/:tag', async (req, res) => {
  try {
    const decodedTag = decodeURIComponent(req.params.tag);
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
router.put('/convo/:conversationId', async (req, res) => {
  try {
    const conversationTags = await updateTagsForConversation(
      req.user.id,
      req.params.conversationId,
      req.body.tags,
    );
    res.status(200).json(conversationTags);
  } catch (error) {
    logger.error('Error updating conversation tags', error);
    res.status(500).send('Error updating conversation tags');
  }
});

module.exports = router;
