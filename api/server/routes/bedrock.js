const express = require('express');
const router = express.Router();
const bedrockAgentController = require('../controllers/bedrockAgentController');

// Bedrock Agent routes
router.get('/bedrockAgents', bedrockAgentController.listBedrockAgents);
router.post('/bedrockAgents/:agentId/chat', bedrockAgentController.sendBedrockAgentMessage);

module.exports = router;
