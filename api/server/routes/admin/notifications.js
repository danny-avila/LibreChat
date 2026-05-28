const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { createBroadcastNotification } = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const notificationPayloadLimit = express.json({ limit: '100kb' });

router.use(requireJwtAuth, requireAdminAccess);

/**
 * POST /admin/notifications/broadcast
 * Body: { type: 'announcement', title, message, link? }
 */
router.post('/broadcast', notificationPayloadLimit, async (req, res) => {
  const { type, title, message, link } = req.body;

  if (type !== 'announcement') {
    return res.status(400).json({ error: 'Broadcast notifications must use type "announcement".' });
  }

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and must be a non-empty string.' });
  }

  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required and must be a non-empty string.' });
  }

  if (link !== undefined && link !== null && typeof link !== 'string') {
    return res.status(400).json({ error: 'Link must be a string when provided.' });
  }

  try {
    const { createdCount } = await createBroadcastNotification({
      type,
      title: title.trim(),
      message: message.trim(),
      link: typeof link === 'string' && link.length > 0 ? link : undefined,
    });
    res.status(201).json({ created: true, createdCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
