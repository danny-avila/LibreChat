const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  createUserProject,
  getUserProjectById,
  getUserProjects,
  updateUserProject,
  deleteUserProject,
} = require('~/models');
const { Conversation } = require('~/db/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const projectPayloadLimit = express.json({ limit: '200kb' });

router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  try {
    const { cursor, limit, search } = req.query;
    const result = await getUserProjects(req.user.id, {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
    });
    res.json(result);
  } catch (error) {
    logger.error('[userProjects] Error listing projects', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:projectId', async (req, res) => {
  try {
    const project = await getUserProjectById(req.user.id, req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const conversationCount = await Conversation.countDocuments({
      user: req.user.id,
      projectId: req.params.projectId,
    });

    res.json({ ...project, conversationCount });
  } catch (error) {
    logger.error('[userProjects] Error getting project', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', projectPayloadLimit, async (req, res) => {
  try {
    const { name, description, instructions, color, icon, defaultModel, defaultEndpoint } =
      req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required.' });
    }

    if (name.length > 200) {
      return res.status(400).json({ error: 'Name must be 200 characters or fewer.' });
    }

    const project = await createUserProject({
      user: req.user.id,
      name: name.trim(),
      description: description?.trim(),
      instructions: instructions?.trim(),
      color,
      icon,
      defaultModel,
      defaultEndpoint,
    });

    res.status(201).json(project);
  } catch (error) {
    logger.error('[userProjects] Error creating project', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:projectId', projectPayloadLimit, async (req, res) => {
  try {
    const updates = {};
    const allowedFields = [
      'name',
      'description',
      'instructions',
      'color',
      'icon',
      'fileIds',
      'memory',
      'defaultModel',
      'defaultEndpoint',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }

    if (updates.name !== undefined && (!updates.name || updates.name.length > 200)) {
      return res.status(400).json({ error: 'Name must be between 1 and 200 characters.' });
    }

    const project = await updateUserProject(req.user.id, req.params.projectId, updates);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    logger.error('[userProjects] Error updating project', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:projectId', async (req, res) => {
  try {
    const deleted = await deleteUserProject(req.user.id, req.params.projectId);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await Conversation.updateMany(
      { user: req.user.id, projectId: req.params.projectId },
      { $unset: { projectId: 1 } },
    );

    res.json({ deleted: true });
  } catch (error) {
    logger.error('[userProjects] Error deleting project', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:projectId/conversations', async (req, res) => {
  try {
    const { cursor, limit = 25 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 25, 100);

    const filters = {
      user: req.user.id,
      projectId: req.params.projectId,
      $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }],
    };

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        filters.updatedAt = { $lt: new Date(decoded.primary) };
      } catch {
        // ignore invalid cursor
      }
    }

    const convos = await Conversation.find(filters)
      .select('conversationId endpoint title createdAt updatedAt user model agent_id assistant_id spec iconURL')
      .sort({ updatedAt: -1 })
      .limit(parsedLimit + 1)
      .lean();

    let nextCursor = null;
    if (convos.length > parsedLimit) {
      convos.pop();
      const last = convos[convos.length - 1];
      const composite = { primary: last.updatedAt.toISOString() };
      nextCursor = Buffer.from(JSON.stringify(composite)).toString('base64');
    }

    res.json({ conversations: convos, nextCursor });
  } catch (error) {
    logger.error('[userProjects] Error listing project conversations', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:projectId/conversations', projectPayloadLimit, async (req, res) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const project = await getUserProjectById(req.user.id, req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await Conversation.findOneAndUpdate(
      { conversationId, user: req.user.id },
      { $set: { projectId: req.params.projectId } },
      { new: true },
    );

    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('[userProjects] Error assigning conversation to project', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:projectId/conversations/:conversationId', async (req, res) => {
  try {
    const result = await Conversation.findOneAndUpdate(
      {
        conversationId: req.params.conversationId,
        user: req.user.id,
        projectId: req.params.projectId,
      },
      { $unset: { projectId: 1 } },
      { new: true },
    );

    if (!result) {
      return res.status(404).json({ error: 'Conversation not found in this project' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('[userProjects] Error removing conversation from project', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
