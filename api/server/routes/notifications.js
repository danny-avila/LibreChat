const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { notificationTypes } = require('librechat-data-provider');
const { enforceJsonBodySizeLimit } = require('@librechat/api');
const {
  createNotification,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { requireCapability } = require('~/server/middleware/roles/capabilities');

const router = express.Router();
const NOTIFICATION_PAYLOAD_LIMIT_BYTES = 102400;
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

router.use(requireJwtAuth);

/**
 * GET /notifications
 * Query: cursor, limit, unreadOnly (true to filter unread only)
 */
router.get('/', async (req, res) => {
  try {
    const { cursor, limit, unreadOnly } = req.query;
    const result = await listNotificationsForUser(req.user.id, {
      cursor: typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined,
      limit: limit !== undefined ? parseInt(String(limit), 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
    res.json(result);
  } catch (error) {
    if (error.name === 'InvalidNotificationCursorError') {
      return res.status(400).json({ error: 'Invalid cursor' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /notifications/read-all
 */
router.post('/read-all', async (req, res) => {
  try {
    const { count } = await markAllNotificationsRead(req.user.id);
    res.json({ updated: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /notifications (admin only)
 * Body: { type, title, message, link? } — for the authenticated admin user.
 * Production fan-out: POST /api/admin/notifications/broadcast or server model methods.
 */
router.post(
  '/',
  requireAdminAccess,
  enforceJsonBodySizeLimit(NOTIFICATION_PAYLOAD_LIMIT_BYTES),
  async (req, res) => {
    const { type, title, message, link } = req.body;

    if (typeof type !== 'string' || !notificationTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid or missing notification type.' });
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
      const notification = await createNotification({
        userId: req.user.id,
        type,
        title: title.trim(),
        message: message.trim(),
        link: typeof link === 'string' && link.length > 0 ? link : undefined,
      });
      res.status(201).json({ created: true, notification });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * PATCH /notifications/:id/read
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const { updated } = await markNotificationRead(req.user.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /notifications/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteNotification(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
