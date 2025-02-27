const express = require('express');
const {
  modelController,
  setCurrentModel,
  getCurrentModel,
} = require('~/server/controllers/ModelController');
const { requireJwtAuth } = require('~/server/middleware/');
const { logger } = require('~/config');

const router = express.Router();
router.get('/', requireJwtAuth, modelController);

router.get('/current', requireJwtAuth, async (req, res) => {
  try {
    const currentModel = await getCurrentModel(req);
    res.status(200).json(currentModel);
  } catch (error) {
    logger.error('Error getting current model:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:key', requireJwtAuth, async (req, res) => {
  try {
    const key = req.params.key;
    const success = await setCurrentModel(req, key);
    if (!success) {
      return res.status(400).json({ error: 'Model key not set' });
    }
    res.status(201).json(`Model key set to ${key}`);
  } catch (error) {
    logger.error('Error saving key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
