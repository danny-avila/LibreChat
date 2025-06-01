const express = require('express');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { requireJwtAuth, generateCheckAccess } = require('~/server/middleware');
const { MemoryEntry } = require('~/db/models');

const router = express.Router();

const checkMemoryRead = generateCheckAccess(PermissionTypes.MEMORIES, [
  Permissions.USE,
  Permissions.READ,
]);
const checkMemoryUpdate = generateCheckAccess(PermissionTypes.MEMORIES, [
  Permissions.USE,
  Permissions.UPDATE,
]);
const checkMemoryDelete = generateCheckAccess(PermissionTypes.MEMORIES, [
  Permissions.USE,
  Permissions.UPDATE,
]);

router.use(requireJwtAuth);

/**
 * GET /memories
 * Returns all memories for the authenticated user, sorted by updated_at (newest first).
 */
router.get('/', checkMemoryRead, async (req, res) => {
  try {
    const memories = await MemoryEntry.find({ userId: req.user.id })
      .sort({ updated_at: -1 })
      .lean();

    res.json({ memories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /memories/:key
 * Updates the value of an existing memory entry for the authenticated user.
 * Body: { value: string }
 * Returns 200 and { updated: true, memory: <updatedDoc> } when successful.
 */
router.patch('/:key', checkMemoryUpdate, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body || {};

  if (typeof value !== 'string' || value.trim() === '') {
    return res.status(400).json({ error: 'Value is required and must be a non-empty string.' });
  }

  try {
    const updated = await MemoryEntry.findOneAndUpdate(
      { userId: req.user.id, key },
      { value, updated_at: Date.now() },
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    res.json({ updated: true, memory: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /memories/:key
 * Deletes a memory entry for the authenticated user.
 * Returns 200 and { deleted: true } when successful.
 */
router.delete('/:key', checkMemoryDelete, async (req, res) => {
  const { key } = req.params;

  try {
    const result = await MemoryEntry.findOneAndDelete({ userId: req.user.id, key });

    if (!result) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
