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
router.get('/:assistant_id', controller.getAssistant);
router.patch('/:assistant_id', controller.updateAssistant);
router.delete('/:assistant_id', controller.deleteAssistant);

// Chat Endpoint
router.post('/:assistant_id/chat', controller.chat);

module.exports = router;
