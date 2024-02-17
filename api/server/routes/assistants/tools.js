const express = require('express');
const { getAvailableTools } = require('~/server/controllers/PluginController');

const router = express.Router();

router.get('/', getAvailableTools);

module.exports = router;
