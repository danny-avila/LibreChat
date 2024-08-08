const express = require('express');
const {
  getConversationTags,
  updateConversationTag,
  createConversationTag,
  deleteConversationTag,
} = require('~/models/ConversationTag');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const router = express.Router();
router.use(requireJwtAuth);

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
    console.error('Error getting conversation tags:', error);
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
    console.error('Error creating conversation tag:', error);
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
    const tag = await updateConversationTag(req.user.id, req.params.tag, req.body);
    if (tag) {
      res.status(200).json(tag);
    } else {
      res.status(404).json({ error: 'Tag not found' });
    }
  } catch (error) {
    console.error('Error updating conversation tag:', error);
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
    const tag = await deleteConversationTag(req.user.id, req.params.tag);
    if (tag) {
      res.status(200).json(tag);
    } else {
      res.status(404).json({ error: 'Tag not found' });
    }
  } catch (error) {
    console.error('Error deleting conversation tag:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
