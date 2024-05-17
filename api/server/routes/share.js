const express = require('express');

const {
  getSharedMessages,
  createSharedLink,
  updateSharedLink,
  getSharedLinks,
  deleteSharedLink,
} = require('~/models/Share');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const router = express.Router();

/**
 * Shared messages
 * this route does not require authentication
 */
router.get('/:shareId', async (req, res) => {
  const share = await getSharedMessages(req.params.shareId);

  if (share) {
    res.status(200).json(share);
  } else {
    res.status(404).end();
  }
});

/**
 * Shared links
 */
router.get('/', requireJwtAuth, async (req, res) => {
  let pageNumber = req.query.pageNumber || 1;
  pageNumber = parseInt(pageNumber, 10);

  if (isNaN(pageNumber) || pageNumber < 1) {
    return res.status(400).json({ error: 'Invalid page number' });
  }

  let pageSize = req.query.pageSize || 25;
  pageSize = parseInt(pageSize, 10);

  if (isNaN(pageSize) || pageSize < 1) {
    return res.status(400).json({ error: 'Invalid page size' });
  }
  const isPublic = req.query.isPublic === 'true';
  res.status(200).send(await getSharedLinks(req.user.id, pageNumber, pageSize, isPublic));
});

router.post('/', requireJwtAuth, async (req, res) => {
  const created = await createSharedLink(req.user.id, req.body);
  if (created) {
    res.status(200).json(created);
  } else {
    res.status(404).end();
  }
});

router.patch('/', requireJwtAuth, async (req, res) => {
  const updated = await updateSharedLink(req.user.id, req.body);
  if (updated) {
    res.status(200).json(updated);
  } else {
    res.status(404).end();
  }
});

router.delete('/:shareId', requireJwtAuth, async (req, res) => {
  const deleted = await deleteSharedLink(req.user.id, { shareId: req.params.shareId });
  if (deleted) {
    res.status(200).json(deleted);
  } else {
    res.status(404).end();
  }
});

module.exports = router;
