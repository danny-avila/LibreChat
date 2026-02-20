const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { saveConvo } = require('~/models/Conversation');
const {
  createUserProject,
  getUserProjects,
  getUserProjectById,
  updateUserProject,
  deleteUserProject,
  addConversationToProject,
  removeConversationFromProject,
  addMemoryEntry,
  removeMemoryEntry,
  updateMemoryEntry,
  getProjectMemory,
  addFileToProject,
  removeFileFromProject,
} = require('~/models/Project');
const { logger } = require('~/config');

const router = express.Router();
router.use(requireJwtAuth);

// GET /api/projects - List user's projects
router.get('/', async (req, res) => {
  try {
    const { isArchived } = req.query;
    const projects = await getUserProjects(req.user.id, {
      isArchived: isArchived === 'true',
    });
    res.status(200).json(projects);
  } catch (error) {
    logger.error('[GET /api/projects] Error listing projects', error);
    res.status(500).json({ message: 'Error listing projects' });
  }
});

// POST /api/projects - Create project
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Project name is required' });
    }
    const project = await createUserProject({
      user: req.user.id,
      name: name.trim(),
      description: description || '',
    });
    res.status(201).json(project);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A project with that name already exists' });
    }
    logger.error('[POST /api/projects] Error creating project', error);
    res.status(500).json({ message: 'Error creating project' });
  }
});

// GET /api/projects/:projectId - Get single project
router.get('/:projectId', async (req, res) => {
  try {
    const project = await getUserProjectById(req.params.projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(200).json(project);
  } catch (error) {
    logger.error('[GET /api/projects/:id] Error getting project', error);
    res.status(500).json({ message: 'Error getting project' });
  }
});

// PATCH /api/projects/:projectId - Update project
router.patch('/:projectId', async (req, res) => {
  try {
    const { name, description, isArchived } = req.body;
    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (isArchived !== undefined) {
      updateData.isArchived = isArchived;
    }
    const project = await updateUserProject(req.params.projectId, req.user.id, updateData);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(200).json(project);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A project with that name already exists' });
    }
    logger.error('[PATCH /api/projects/:id] Error updating project', error);
    res.status(500).json({ message: 'Error updating project' });
  }
});

// DELETE /api/projects/:projectId - Delete project
router.delete('/:projectId', async (req, res) => {
  try {
    const project = await deleteUserProject(req.params.projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(200).json({ message: 'Project deleted' });
  } catch (error) {
    logger.error('[DELETE /api/projects/:id] Error deleting project', error);
    res.status(500).json({ message: 'Error deleting project' });
  }
});

// --- Conversation association endpoints ---

// POST /api/projects/:projectId/conversations/:conversationId - Associate conversation
router.post('/:projectId/conversations/:conversationId', async (req, res) => {
  try {
    const project = await addConversationToProject(
      req.params.projectId,
      req.user.id,
      req.params.conversationId,
    );
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    await saveConvo(req, {
      conversationId: req.params.conversationId,
      projectId: req.params.projectId,
    });
    res.status(200).json(project);
  } catch (error) {
    logger.error('[POST /api/projects/:id/conversations/:cid] Error associating conversation', error);
    res.status(500).json({ message: 'Error associating conversation' });
  }
});

// DELETE /api/projects/:projectId/conversations/:conversationId - Disassociate conversation
router.delete('/:projectId/conversations/:conversationId', async (req, res) => {
  try {
    await removeConversationFromProject(
      req.params.projectId,
      req.user.id,
      req.params.conversationId,
    );
    await saveConvo(req, {
      conversationId: req.params.conversationId,
      projectId: null,
    });
    res.status(200).json({ message: 'Conversation removed from project' });
  } catch (error) {
    logger.error('[DELETE /api/projects/:id/conversations/:cid] Error disassociating conversation', error);
    res.status(500).json({ message: 'Error disassociating conversation' });
  }
});

// --- Memory endpoints ---

// GET /api/projects/:projectId/memory - Get memory entries
router.get('/:projectId/memory', async (req, res) => {
  try {
    const entries = await getProjectMemory(req.params.projectId, req.user.id);
    res.status(200).json(entries);
  } catch (error) {
    logger.error('[GET /api/projects/:id/memory] Error getting memory', error);
    res.status(500).json({ message: 'Error getting project memory' });
  }
});

// POST /api/projects/:projectId/memory - Add memory entry
router.post('/:projectId/memory', async (req, res) => {
  try {
    const { content, source, extractedFrom, category } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ message: 'Memory content is required' });
    }
    const project = await addMemoryEntry(req.params.projectId, req.user.id, {
      content: content.trim(),
      source: source || 'manual',
      extractedFrom,
      category,
    });
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(201).json(project.memoryEntries);
  } catch (error) {
    logger.error('[POST /api/projects/:id/memory] Error adding memory', error);
    res.status(500).json({ message: 'Error adding memory entry' });
  }
});

// PATCH /api/projects/:projectId/memory/:entryId - Update memory entry
router.patch('/:projectId/memory/:entryId', async (req, res) => {
  try {
    const { content, category } = req.body;
    const project = await updateMemoryEntry(
      req.params.projectId,
      req.user.id,
      req.params.entryId,
      { content, category },
    );
    if (!project) {
      return res.status(404).json({ message: 'Memory entry not found' });
    }
    res.status(200).json(project.memoryEntries);
  } catch (error) {
    logger.error('[PATCH /api/projects/:id/memory/:eid] Error updating memory', error);
    res.status(500).json({ message: 'Error updating memory entry' });
  }
});

// DELETE /api/projects/:projectId/memory/:entryId - Delete memory entry
router.delete('/:projectId/memory/:entryId', async (req, res) => {
  try {
    const project = await removeMemoryEntry(
      req.params.projectId,
      req.user.id,
      req.params.entryId,
    );
    res.status(200).json(project?.memoryEntries || []);
  } catch (error) {
    logger.error('[DELETE /api/projects/:id/memory/:eid] Error deleting memory', error);
    res.status(500).json({ message: 'Error deleting memory entry' });
  }
});

// --- File association endpoints ---

// POST /api/projects/:projectId/files/:fileId - Associate file with project
router.post('/:projectId/files/:fileId', async (req, res) => {
  try {
    const project = await addFileToProject(
      req.params.projectId,
      req.user.id,
      req.params.fileId,
    );
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.status(200).json(project);
  } catch (error) {
    logger.error('[POST /api/projects/:id/files/:fid] Error associating file', error);
    res.status(500).json({ message: 'Error associating file' });
  }
});

// DELETE /api/projects/:projectId/files/:fileId - Disassociate file from project
router.delete('/:projectId/files/:fileId', async (req, res) => {
  try {
    const project = await removeFileFromProject(
      req.params.projectId,
      req.user.id,
      req.params.fileId,
    );
    res.status(200).json(project);
  } catch (error) {
    logger.error('[DELETE /api/projects/:id/files/:fid] Error disassociating file', error);
    res.status(500).json({ message: 'Error disassociating file' });
  }
});

module.exports = router;
