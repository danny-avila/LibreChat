const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');

const GENERATED_FILES_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'generated_files');

const getModel = () => mongoose.model('GeneratedFile');

// Test route: verify the router is mounted
router.get('/ping', (req, res) => res.json({ ok: true }));

// List generated files for the current user
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.query.conversationId;
    const GeneratedFile = getModel();

    const filter = { user: userId };
    if (conversationId) {
      filter.conversationId = conversationId;
    }

    const files = await GeneratedFile.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json(files);
  } catch (error) {
    logger.error('[GeneratedFiles] Error listing files:', error);
    res.status(500).json({ message: 'Error listing generated files' });
  }
});

// Download a generated file
router.get('/:id/download', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;
    const GeneratedFile = getModel();

    const file = await GeneratedFile.findOne({ _id: fileId, user: userId }).lean();
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filePath = path.join(GENERATED_FILES_PATH, file.filepath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mimeType);
    res.sendFile(filePath);
  } catch (error) {
    logger.error('[GeneratedFiles] Error downloading file:', error);
    res.status(500).json({ message: 'Error downloading file' });
  }
});

// Delete a generated file
router.delete('/:id', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;
    const GeneratedFile = getModel();

    const file = await GeneratedFile.findOne({ _id: fileId, user: userId }).lean();
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Delete from disk
    const filePath = path.join(GENERATED_FILES_PATH, file.filepath);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (diskError) {
      logger.warn('[GeneratedFiles] Could not delete file from disk:', diskError.message);
    }

    await GeneratedFile.deleteOne({ _id: fileId });
    res.json({ ok: true });
  } catch (error) {
    logger.error('[GeneratedFiles] Error deleting file:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
});

module.exports = router;
