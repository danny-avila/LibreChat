const { z } = require('zod');
const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const { deleteFiles } = require('~/models');
const { logger } = require('~/config');

const router = express.Router();

const isUUID = z.string().uuid();

const isValidPath = (req, base, subfolder, filepath) => {
  const normalizedBase = path.resolve(base, subfolder, req.user.id);
  const normalizedFilepath = path.resolve(filepath);
  return normalizedFilepath.startsWith(normalizedBase);
};

const deleteFile = async (req, file) => {
  const { publicPath } = req.app.locals.config;
  const parts = file.filepath.split(path.sep);
  const subfolder = parts[1];
  const filepath = path.join(publicPath, file.filepath);

  if (!isValidPath(req, publicPath, subfolder, filepath)) {
    throw new Error('Invalid file path');
  }

  await fs.unlink(filepath);
};

router.delete('/', async (req, res) => {
  try {
    const { files: _files } = req.body;
    const files = _files.filter((file) => {
      if (!file.file_id) {
        return false;
      }
      if (!file.filepath) {
        return false;
      }
      return isUUID.safeParse(file.file_id).success;
    });

    if (files.length === 0) {
      res.status(204).json({ message: 'Nothing provided to delete' });
      return;
    }

    const file_ids = files.map((file) => file.file_id);
    const promises = [];
    promises.push(await deleteFiles(file_ids));
    for (const file of files) {
      promises.push(deleteFile(req, file));
    }

    await Promise.all(promises);
    res.status(200).json({ message: 'Files deleted successfully' });
  } catch (error) {
    logger.error('[/files] Error deleting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

module.exports = router;
