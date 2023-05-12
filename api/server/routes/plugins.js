const express = require('express');
// const { getAvailableToolsController } = require('../controllers/plugin.controller');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const fs = require('fs');

const router = express.Router();

// router.get('/', requireJwtAuth, getAvailableToolsController);
router.get('/', requireJwtAuth, (req, res) => {
  try {
    const manifest = JSON.parse(fs.readFileSync('../../app/langchain/tools/manifest.json', 'utf8'));
    console.log(manifest);
    res.status(200).json(manifest);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});
