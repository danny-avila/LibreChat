const express = require('express');
const { getMCPManager } = require('~/config');
const { requireJwtAuth } = require('../../middleware');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

/**
 * POST /api/mcp/elicitations/:id/respond
 * Respond to an elicitation request
 */
router.post('/:id/respond', requireJwtAuth, async (req, res) => {
  try {
    const { id: elicitationId } = req.params;
    const { action, content } = req.body;
    const userId = req.user.id;

    // Validate the response
    if (!['accept', 'decline', 'cancel'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be accept, decline, or cancel' });
    }

    const mcpManager = getMCPManager();

    // Verify the elicitation belongs to the user
    const elicitation = mcpManager.getElicitationState(elicitationId);
    if (!elicitation) {
      return res.status(404).json({ error: 'Elicitation not found' });
    }

    if (elicitation.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Respond to the elicitation
    const success = mcpManager.respondToElicitation(elicitationId, { action, content });

    if (!success) {
      return res.status(400).json({ error: 'Failed to respond to elicitation' });
    }

    res.json({ success: true, message: 'Response sent successfully' });
  } catch (error) {
    logger.error('[MCP] Error responding to elicitation:', error);
    res.status(500).json({ error: 'Failed to respond to elicitation' });
  }
});

module.exports = router;
