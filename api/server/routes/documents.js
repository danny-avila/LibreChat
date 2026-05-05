const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  markdownToDocxBuffer,
  sanitizeFilenameStem,
  DOCX_MIME,
} = require('~/server/services/Files/Anthropic/markdownToDocx');

const router = express.Router();

router.use(requireJwtAuth);

/**
 * Convert a markdown string to a downloadable .docx file. Used by the
 * existing hover-button on assistant messages (kept as a fallback for
 * cases where the auto-attach [DOCUMENT] flow doesn't produce a file).
 */
router.post('/docx', async (req, res) => {
  try {
    const { content, title = 'Assignment' } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const buffer = await markdownToDocxBuffer(content);
    const filename = `${sanitizeFilenameStem(title)}.docx`;

    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

module.exports = router;
