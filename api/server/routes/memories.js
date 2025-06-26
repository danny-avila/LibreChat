const express = require('express');
const { Tokenizer, generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getAllUserMemories,
  toggleUserMemories,
  createMemory,
  deleteMemory,
  setMemory,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

const checkMemoryRead = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.READ],
  getRoleByName,
});
const checkMemoryCreate = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});
const checkMemoryUpdate = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.UPDATE],
  getRoleByName,
});
const checkMemoryDelete = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.UPDATE],
  getRoleByName,
});
const checkMemoryOptOut = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.OPT_OUT],
  getRoleByName,
});

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
 * POST /memories
 * Creates a new memory entry for the authenticated user.
 * Body: { key: string, value: string }
 * Returns 201 and { created: true, memory: <createdDoc> } when successful.
 */
router.post('/', checkMemoryCreate, async (req, res) => {
  const { key, value } = req.body;

  if (typeof key !== 'string' || key.trim() === '') {
    return res.status(400).json({ error: 'Key is required and must be a non-empty string.' });
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return res.status(400).json({ error: 'Value is required and must be a non-empty string.' });
  }

  try {
    const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');

    const memories = await getAllUserMemories(req.user.id);

    // Check token limit
    const memoryConfig = req.app.locals?.memory;
    const tokenLimit = memoryConfig?.tokenLimit;

    if (tokenLimit) {
      const currentTotalTokens = memories.reduce(
        (sum, memory) => sum + (memory.tokenCount || 0),
        0,
      );
      if (currentTotalTokens + tokenCount > tokenLimit) {
        return res.status(400).json({
          error: `Adding this memory would exceed the token limit of ${tokenLimit}. Current usage: ${currentTotalTokens} tokens.`,
        });
      }
    }

    const result = await createMemory({
      userId: req.user.id,
      key: key.trim(),
      value: value.trim(),
      tokenCount,
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'Failed to create memory.' });
    }

    const updatedMemories = await getAllUserMemories(req.user.id);
    const newMemory = updatedMemories.find((m) => m.key === key.trim());

    res.status(201).json({ created: true, memory: newMemory });
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({ error: 'Memory with this key already exists.' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /memories/preferences
 * Updates the user's memory preferences (e.g., enabling/disabling memories).
 * Body: { memories: boolean }
 * Returns 200 and { updated: true, preferences: { memories: boolean } } when successful.
 */
router.patch('/preferences', checkMemoryOptOut, async (req, res) => {
  const { memories } = req.body;

  if (typeof memories !== 'boolean') {
    return res.status(400).json({ error: 'memories must be a boolean value.' });
  }

  try {
    const updatedUser = await toggleUserMemories(req.user.id, memories);

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      updated: true,
      preferences: {
        memories: updatedUser.personalization?.memories ?? true,
      },
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
