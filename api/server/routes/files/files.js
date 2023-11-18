const { z } = require('zod');
const fs = require('fs').promises;
const express = require('express');
const { deleteFiles } = require('~/models');

const router = express.Router();

const isUUID = z.string().uuid();

router.delete('/', async (req, res) => {
  try {
    console.log('req.body', req.body);
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

    const file_ids = files.map((file) => file.file_id);
    const promises = [];
    promises.push(await deleteFiles(file_ids));
    for (const { filepath } of files) {
      promises.push(await fs.unlink(filepath));
    }

    await Promise.all(promises);
    res.status(200).json({ message: 'Files deleted successfully' });
  } catch (error) {
    console.error('Error deleting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

module.exports = router;
