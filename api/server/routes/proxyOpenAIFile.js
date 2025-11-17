const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Proxy endpoint to fetch files from OpenAI vector store
router.get('/proxy-openai-file/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }
  try {
    const response = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      return res.status(response.status).send('Error fetching file from OpenAI');
    }
    res.setHeader('Content-Disposition', response.headers.get('content-disposition') || 'attachment');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Failed to proxy file', details: err.message });
  }
});

module.exports = router;
