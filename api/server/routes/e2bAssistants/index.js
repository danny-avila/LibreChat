const express = require('express');
const { uaParser, checkBan, requireJwtAuth } = require('~/server/middleware');
const controller = require('./controller');

const router = express.Router();

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

// CRUD Endpoints
router.post('/', controller.createAssistant);
router.get('/', controller.listAssistants);
router.get('/documents', controller.getAssistantDocuments); // Must be before /:assistant_id
router.get('/tools', controller.getAssistantTools); // Must be before /:assistant_id
router.get('/:assistant_id', controller.getAssistant);
router.patch('/:assistant_id', controller.updateAssistant);
router.delete('/:assistant_id', controller.deleteAssistant);

// Chat Endpoint
router.post('/chat', controller.chat);

module.exports = router;
