const express = require('express');
const { createProjectHandlers } = require('@librechat/api');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();
const handlers = createProjectHandlers({
  listChatProjects: db.listChatProjects,
  createChatProject: db.createChatProject,
  getChatProject: db.getChatProject,
  updateChatProject: db.updateChatProject,
  deleteChatProject: db.deleteChatProject,
  assignConversationToProject: db.assignConversationToProject,
});

router.use(requireJwtAuth);

router.get('/', handlers.listProjects);
router.post('/', handlers.createProject);
router.put(
  '/conversations/:conversationId',
  configMiddleware,
  handlers.assignConversationToProject,
);
router.get('/:projectId', handlers.getProject);
router.patch('/:projectId', handlers.updateProject);
router.delete('/:projectId', configMiddleware, handlers.deleteProject);

module.exports = router;
