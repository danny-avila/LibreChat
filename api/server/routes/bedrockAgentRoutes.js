const express = require('express');
const router = express.Router();
const bedrockAgentController = require('../controllers/bedrockAgentController');

router.get('/', bedrockAgentController.listAgents);

module.exports = router;
