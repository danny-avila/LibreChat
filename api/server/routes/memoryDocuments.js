const express = require('express');
const { Tokenizer, generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getMemoryDocumentsByUser,
  upsertMemoryDocument,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

const checkMemoryRead = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.READ],
  getRoleByName,
});

const checkMemoryUpdate = generateCheckAccess({
  permissionType: PermissionTypes.MEMORIES,
  permissions: [Permissions.USE, Permissions.UPDATE],
  getRoleByName,
});

router.use(requireJwtAuth);

router.get('/', checkMemoryRead, async (req, res) => {
  try {
    const documents = await getMemoryDocumentsByUser(req.user.id);
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:scope/:projectId?', checkMemoryRead, async (req, res) => {
  const { scope, projectId } = req.params;

  if (scope !== 'global' && scope !== 'project') {
    return res.status(400).json({ error: 'Scope must be "global" or "project".' });
  }

  if (scope === 'project' && !projectId) {
    return res.status(400).json({ error: 'projectId is required for project scope.' });
  }

  try {
    const documents = await getMemoryDocumentsByUser(req.user.id);
    const doc = documents.find((d) => {
      if (scope === 'global') {
        return d.scope === 'global';
      }
      return d.scope === 'project' && d.projectId?.toString() === projectId;
    });

    if (!doc) {
      return res.json({ _id: null, scope, projectId: projectId || null, content: '', tokenCount: 0 });
    }

    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:scope/:projectId?', checkMemoryUpdate, async (req, res) => {
  const { scope, projectId } = req.params;
  const { content } = req.body;

  if (scope !== 'global' && scope !== 'project') {
    return res.status(400).json({ error: 'Scope must be "global" or "project".' });
  }

  if (scope === 'project' && !projectId) {
    return res.status(400).json({ error: 'projectId is required for project scope.' });
  }

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string.' });
  }

  try {
    const tokenCount = content ? Tokenizer.getTokenCount(content, 'o200k_base') : 0;
    const doc = await upsertMemoryDocument({
      userId: req.user.id,
      scope,
      projectId: scope === 'project' ? projectId : null,
      content,
      tokenCount,
    });
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
