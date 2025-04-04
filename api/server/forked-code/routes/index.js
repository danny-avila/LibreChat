const express = require('express');
const router = express.Router();

const litellmRoutes = require('./litellm');

// Register all custom routes with a /forked prefix to avoid conflicts
router.use('/litellm', litellmRoutes);

module.exports = router;