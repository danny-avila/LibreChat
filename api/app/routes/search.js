const express = require('express');
const router = express.Router();
const SearXNGService = require('../clients/tools/searxng');

const searxng = new SearXNGService();

router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    const results = await searxng.search(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
