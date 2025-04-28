const express = require('express');
const router = express.Router();
const { createApiKey, deleteApiKey, getApiKeys } = require('../services/ApiKeyService');
const { requireJwtAuth } = require('../middleware/');

router.post('/', requireJwtAuth, async (req, res) => {
  try {
    const result = await createApiKey({ userId: req.user.id, ...req.body });
    res.status(201).send(result);
  } catch (error) {
    res.status(500).send({ error: 'Failed to create API key', reason: error.message });
  }
});

router.delete('/:id', requireJwtAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await deleteApiKey({ userId: req.user.id, id });
    res.status(204).send();
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete API key', reason: error.message });
  }
});

router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const response = await getApiKeys({ userId: req.user.id });
    res.status(200).send(response);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch API keys', reason: error.message });
  }
});

module.exports = router;
