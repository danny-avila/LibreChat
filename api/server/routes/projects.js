const express = require('express');
const { isValidObjectIdString, logger } = require('@librechat/data-schemas');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const db = require('~/models');

const router = express.Router();
router.use(requireJwtAuth);

const PROJECT_NOT_FOUND = 'Project not found';
const CONVERSATION_NOT_FOUND = 'Conversation not found';

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeLimit = (value) => {
  const limit = parseInt(value, 10);
  if (!Number.isFinite(limit)) {
    return 25;
  }
  return Math.min(Math.max(limit, 1), 100);
};

router.get('/', async (req, res) => {
  try {
    const result = await db.listChatProjects(req.user.id, {
      cursor: req.query.cursor,
      limit: normalizeLimit(req.query.limit),
      sortBy: req.query.sortBy,
      sortDirection: req.query.sortDirection,
      search: req.query.search,
    });
    res.status(200).json(result);
  } catch (error) {
    logger.error('[projects] Error listing projects', error);
    res.status(500).json({ error: 'Error listing projects' });
  }
});

router.post('/', async (req, res) => {
  const name = normalizeString(req.body?.name);
  const description = typeof req.body?.description === 'string' ? req.body.description : '';

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const project = await db.createChatProject(req.user.id, { name, description });
    res.status(201).json(project);
  } catch (error) {
    logger.error('[projects] Error creating project', error);
    res.status(500).json({ error: 'Error creating project' });
  }
});

router.put('/conversations/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const projectId = req.body?.projectId ?? null;

  if (projectId !== null && typeof projectId !== 'string') {
    return res.status(400).json({ error: 'projectId must be a string or null' });
  }

  try {
    const result = await db.assignConversationToProject(req.user.id, conversationId, projectId);
    if (!result) {
      return res.status(404).json({ error: CONVERSATION_NOT_FOUND });
    }
    res.status(200).json(result);
  } catch (error) {
    if (error?.message === PROJECT_NOT_FOUND) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }
    logger.error('[projects] Error assigning conversation to project', error);
    res.status(500).json({ error: 'Error assigning conversation to project' });
  }
});

router.get('/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!isValidObjectIdString(projectId)) {
    return res.status(404).json({ error: PROJECT_NOT_FOUND });
  }

  try {
    const project = await db.getChatProject(req.user.id, projectId);
    if (!project) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }
    res.status(200).json(project);
  } catch (error) {
    logger.error('[projects] Error getting project', error);
    res.status(500).json({ error: 'Error getting project' });
  }
});

router.patch('/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!isValidObjectIdString(projectId)) {
    return res.status(404).json({ error: PROJECT_NOT_FOUND });
  }

  const input = {};
  if (req.body?.name !== undefined) {
    const name = normalizeString(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    input.name = name;
  }
  if (req.body?.description !== undefined) {
    input.description = typeof req.body.description === 'string' ? req.body.description : '';
  }

  try {
    const project = await db.updateChatProject(req.user.id, projectId, input);
    if (!project) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }
    res.status(200).json(project);
  } catch (error) {
    logger.error('[projects] Error updating project', error);
    res.status(500).json({ error: 'Error updating project' });
  }
});

router.delete('/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!isValidObjectIdString(projectId)) {
    return res.status(404).json({ error: PROJECT_NOT_FOUND });
  }

  try {
    const result = await db.deleteChatProject(req.user.id, projectId);
    if (!result.deletedCount) {
      return res.status(404).json({ error: PROJECT_NOT_FOUND });
    }
    res.status(200).json(result);
  } catch (error) {
    logger.error('[projects] Error deleting project', error);
    res.status(500).json({ error: 'Error deleting project' });
  }
});

module.exports = router;
