const express = require('express');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { Tokenizer } = require('@librechat/api');
const { requireJwtAuth, generateCheckAccess } = require('~/server/middleware');
const { getAllUserMemories, setMemory, deleteMemory } = require('~/models');

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
 * Also includes memory usage percentage based on token limit.
 */
router.get('/', checkMemoryRead, async (req, res) => {
  try {
    const memories = await getAllUserMemories(req.user.id);

    const sortedMemories = memories.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    const totalTokens = memories.reduce((sum, memory) => {
      return sum + (memory.tokenCount || 0);
    }, 0);

    const memoryConfig = req.app.locals?.memory;
    const tokenLimit = memoryConfig?.tokenLimit;

    let usagePercentage = null;
    if (tokenLimit && tokenLimit > 0) {
      usagePercentage = Math.min(100, Math.round((totalTokens / tokenLimit) * 100));
    }

    res.json({
      memories: sortedMemories,
      totalTokens,
      tokenLimit: tokenLimit || null,
      usagePercentage,
    });
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
    const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');

    const memories = await getAllUserMemories(req.user.id);
    const existingMemory = memories.find((m) => m.key === key);

    if (!existingMemory) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    const result = await setMemory({
      userId: req.user.id,
      key,
      value,
      tokenCount,
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'Failed to update memory.' });
    }

    const updatedMemories = await getAllUserMemories(req.user.id);
    const updatedMemory = updatedMemories.find((m) => m.key === key);

    res.json({ updated: true, memory: updatedMemory });
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
    const result = await deleteMemory({ userId: req.user.id, key });

    if (!result.ok) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
