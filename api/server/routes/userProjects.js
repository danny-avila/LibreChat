const express = require('express');
const { generateCheckAccess } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  createUserProject,
  getUserProjects,
  updateUserProject,
  deleteUserProject,
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

router.use(requireJwtAuth);

router.get('/', checkMemoryRead, async (req, res) => {
  try {
    const projects = await getUserProjects(req.user.id);
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', checkMemoryCreate, async (req, res) => {
  const { name, description } = req.body;

  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required and must be a non-empty string.' });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must be 100 characters or less.' });
  }

  if (description && description.length > 500) {
    return res.status(400).json({ error: 'Description must be 500 characters or less.' });
  }

  try {
    const project = await createUserProject(req.user.id, name.trim(), description?.trim());
    res.status(201).json(project);
  } catch (error) {
    if (error.message && error.message.includes('duplicate')) {
      return res.status(409).json({ error: 'A project with this name already exists.' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', checkMemoryUpdate, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return res.status(400).json({ error: 'Name must be a non-empty string.' });
  }

  if (name && name.trim().length > 100) {
    return res.status(400).json({ error: 'Name must be 100 characters or less.' });
  }

  if (description !== undefined && description !== null && description.length > 500) {
    return res.status(400).json({ error: 'Description must be 500 characters or less.' });
  }

  try {
    const updates = {};
    if (name !== undefined) {
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description?.trim() || undefined;
    }

    const project = await updateUserProject(req.user.id, id, updates);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json(project);
  } catch (error) {
    if (error.message && error.message.includes('duplicate')) {
      return res.status(409).json({ error: 'A project with this name already exists.' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', checkMemoryUpdate, async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await deleteUserProject(req.user.id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json({ deleted: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
