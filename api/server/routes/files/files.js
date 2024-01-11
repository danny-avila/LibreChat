const { z } = require('zod');
const express = require('express');
const { FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { deleteFiles, getFiles } = require('~/models');
const { logger } = require('~/config');

const router = express.Router();

const isUUID = z.string().uuid();

router.get('/', async (req, res) => {
  try {
    const files = await getFiles({ user: req.user.id });
    res.status(200).send(files);
  } catch (error) {
    logger.error('[/files] Error getting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { files: _files } = req.body;

    /** @type {MongoFile[]} */
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
    const deletionMethods = {};
    const promises = [];
    promises.push(await deleteFiles(file_ids));

    for (const file of files) {
      const source = file.source ?? FileSources.local;

      if (deletionMethods[source]) {
        promises.push(deletionMethods[source](req, file));
        continue;
      }

      const { deleteFile } = getStrategyFunctions(source);
      if (!deleteFile) {
        throw new Error(`Delete function not implemented for ${source}`);
      }

      deletionMethods[source] = deleteFile;
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
