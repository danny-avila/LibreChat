const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { updateFileSchema } = require('librechat-data-provider');
const db = require('~/models');

const router = express.Router();

// Custom NJ route which lets you modify a file's name or pinned status
router.patch('/:file_id', async (req, res) => {
  try {
    const result = updateFileSchema.safeParse({ ...req.body, file_id: req.params.file_id });
    if (!result.success) {
      return res.status(400).json({ message: result.error.errors[0].message });
    }
    const { file_id, ...update } = result.data;
    const file = await db.getFiles({ file_id, user: req.user.id });
    if (!file.length) {
      return res.status(404).json({ message: 'File not found' });
    }
    const updated = await db.updateFile({ file_id, ...update }, { user: req.user.id });
    res.status(200).json(updated);
  } catch (error) {
    logger.error('[PATCH /files/:file_id] Error updating file', error);
    res.status(500).json({ message: 'Error updating file', error: error.message });
  }
});

module.exports = router;
