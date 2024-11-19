const express = require('express');
const router = express.Router();
const SearXNGService = require('../../app/clients/tools/searxng');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const searxng = new SearXNGService();

router.use(requireJwtAuth);

router.post('/', async (req, res) => {
  try {
    const { query } = req.body;
    const results = await searxng.search(query);
    res.json(results);
  } catch (error) {
    console.error('Web search error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
