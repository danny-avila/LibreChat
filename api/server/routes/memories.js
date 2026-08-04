const express = require('express');
const { Tokenizer, generateCheckAccess } = require('@librechat/api');
const {
  PermissionTypes,
  PermissionBits,
  ResourceType,
  Permissions,
} = require('librechat-data-provider');
const { findAccessibleResources } = require('~/server/services/PermissionService');
const {
  getAllUserMemories,
  getUserMemories,
  toggleUserMemories,
  getRoleByName,
  createMemory,
  deleteMemory,
  setMemory,
  getAgents,
  getChatProject,
} = require('~/models');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');

const router = express.Router();

const memoryPayloadLimit = express.json({ limit: '100kb' });

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

/** Normalizes an optional partition param; undefined = shared personal pool */
const getPartitionParam = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** Resolves agent display names for agent-partitioned memories, restricted
 *  to agents the requester can VIEW — `agentId` is caller-supplied on write,
 *  so an unrestricted lookup would leak private agents' names. */
const withAgentNames = async (memories, user) => {
  const agentIds = [...new Set(memories.map((m) => m.agentId).filter(Boolean))];
  if (agentIds.length === 0) {
    return memories;
  }
  try {
    const accessibleIds = await findAccessibleResources({
      userId: user.id,
      role: user.role,
      resourceType: ResourceType.AGENT,
      requiredPermissions: PermissionBits.VIEW,
    });
    const agents = await getAgents({ id: { $in: agentIds }, _id: { $in: accessibleIds } });
    const namesById = new Map(agents.map((agent) => [agent.id, agent.name]));
    return memories.map((memory) =>
      memory.agentId
        ? { ...memory, agentName: namesById.get(memory.agentId) ?? undefined }
        : memory,
    );
  } catch (_error) {
    return memories;
  }
};

/** Resolves project display names for project-partitioned memories. Each lookup
 *  is scoped to the requester, so a `chatProjectId` they do not own resolves to
 *  nothing rather than leaking another user's project name. */
const withProjectNames = async (memories, user) => {
  const projectIds = [...new Set(memories.map((m) => m.chatProjectId).filter(Boolean))];
  if (projectIds.length === 0) {
    return memories;
  }
  try {
    const projects = await Promise.all(projectIds.map((id) => getChatProject(user.id, id)));
    const namesById = new Map(
      projects.filter(Boolean).map((project) => [project._id.toString(), project.name]),
    );
    return memories.map((memory) =>
      memory.chatProjectId
        ? { ...memory, chatProjectName: namesById.get(memory.chatProjectId) ?? undefined }
        : memory,
    );
  } catch (_error) {
    return memories;
  }
};

/**
 * GET /memories
 * Returns all memories for the authenticated user, sorted by updated_at (newest first).
 * Also includes memory usage percentage based on token limit.
 */
router.get('/', checkMemoryRead, configMiddleware, async (req, res) => {
  try {
    const memories = await getAllUserMemories(req.user.id);

    const named = await withProjectNames(await withAgentNames(memories, req.user), req.user);
    const sortedMemories = named.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    /** Usage totals reflect the shared personal pool only — `tokenLimit`
     *  applies per partition, matching the inline tools' enforcement. */
    const totalTokens = memories.reduce((sum, memory) => {
      return sum + (memory.agentId || memory.chatProjectId ? 0 : memory.tokenCount || 0);
    }, 0);

    const appConfig = req.config;
    const memoryConfig = appConfig?.memory;
    const tokenLimit = memoryConfig?.tokenLimit;
    const charLimit = memoryConfig?.charLimit || 10000;

    let usagePercentage = null;
    if (tokenLimit && tokenLimit > 0) {
      usagePercentage = Math.min(100, Math.round((totalTokens / tokenLimit) * 100));
    }

    res.json({
      memories: sortedMemories,
      totalTokens,
      tokenLimit: tokenLimit || null,
      charLimit,
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
router.post('/', memoryPayloadLimit, checkMemoryCreate, configMiddleware, async (req, res) => {
  const { key, value } = req.body;
  const agentId = getPartitionParam(req.body.agentId);
  const chatProjectId = getPartitionParam(req.body.chatProjectId);

  if (typeof key !== 'string' || key.trim() === '') {
    return res.status(400).json({ error: 'Key is required and must be a non-empty string.' });
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return res.status(400).json({ error: 'Value is required and must be a non-empty string.' });
  }

  const appConfig = req.config;
  const memoryConfig = appConfig?.memory;
  const charLimit = memoryConfig?.charLimit || 10000;

  if (key.length > 1000) {
    return res.status(400).json({
      error: `Key exceeds maximum length of 1000 characters. Current length: ${key.length} characters.`,
    });
  }

  if (value.length > charLimit) {
    return res.status(400).json({
      error: `Value exceeds maximum length of ${charLimit} characters. Current length: ${value.length} characters.`,
    });
  }

  try {
    const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');

    const memories = await getUserMemories({ userId: req.user.id, agentId, chatProjectId });

    const appConfig = req.config;
    const memoryConfig = appConfig?.memory;
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
      agentId,
      chatProjectId,
    });

    if (!result.ok) {
      return res.status(500).json({ error: 'Failed to create memory.' });
    }

    const updatedMemories = await getUserMemories({ userId: req.user.id, agentId, chatProjectId });
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
 * Body: { key?: string, value: string }
 * Returns 200 and { updated: true, memory: <updatedDoc> } when successful.
 */
router.patch('/:key', memoryPayloadLimit, checkMemoryUpdate, configMiddleware, async (req, res) => {
  const { key: urlKey } = req.params;
  const { key: bodyKey, value } = req.body || {};
  const agentId = getPartitionParam(req.query.agentId);
  const chatProjectId = getPartitionParam(req.query.chatProjectId);

  if (typeof value !== 'string' || value.trim() === '') {
    return res.status(400).json({ error: 'Value is required and must be a non-empty string.' });
  }

  const newKey = bodyKey || urlKey;
  const appConfig = req.config;
  const memoryConfig = appConfig?.memory;
  const charLimit = memoryConfig?.charLimit || 10000;

  if (newKey.length > 1000) {
    return res.status(400).json({
      error: `Key exceeds maximum length of 1000 characters. Current length: ${newKey.length} characters.`,
    });
  }

  if (value.length > charLimit) {
    return res.status(400).json({
      error: `Value exceeds maximum length of ${charLimit} characters. Current length: ${value.length} characters.`,
    });
  }

  try {
    const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');

    const memories = await getUserMemories({ userId: req.user.id, agentId, chatProjectId });
    const existingMemory = memories.find((m) => m.key === urlKey);

    if (!existingMemory) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    if (newKey !== urlKey) {
      const keyExists = memories.find((m) => m.key === newKey);
      if (keyExists) {
        return res.status(409).json({ error: 'Memory with this key already exists.' });
      }

      const createResult = await createMemory({
        userId: req.user.id,
        key: newKey,
        value,
        tokenCount,
        agentId,
        chatProjectId,
      });

      if (!createResult.ok) {
        return res.status(500).json({ error: 'Failed to create new memory.' });
      }

      const deleteResult = await deleteMemory({
        userId: req.user.id,
        key: urlKey,
        agentId,
        chatProjectId,
      });
      if (!deleteResult.ok) {
        return res.status(500).json({ error: 'Failed to delete old memory.' });
      }
    } else {
      const result = await setMemory({
        userId: req.user.id,
        key: newKey,
        value,
        tokenCount,
        agentId,
        chatProjectId,
      });

      if (!result.ok) {
        return res.status(500).json({ error: 'Failed to update memory.' });
      }
    }

    const updatedMemories = await getUserMemories({ userId: req.user.id, agentId, chatProjectId });
    const updatedMemory = updatedMemories.find((m) => m.key === newKey);

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
  const agentId = getPartitionParam(req.query.agentId);
  const chatProjectId = getPartitionParam(req.query.chatProjectId);

  try {
    const result = await deleteMemory({ userId: req.user.id, key, agentId, chatProjectId });

    if (!result.ok) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
