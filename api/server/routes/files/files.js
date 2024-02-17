const axios = require('axios');
const fs = require('fs').promises;
const express = require('express');
const { isUUID } = require('librechat-data-provider');
const {
  filterFile,
  processFileUpload,
  processDeleteRequest,
} = require('~/server/services/Files/process');
const { getFiles } = require('~/models/File');
const { logger } = require('~/config');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const files = await getFiles({ user: req.user.id });
    res.status(200).send(files);
  } catch (error) {
    logger.error('[/files] Error getting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.get('/config', async (req, res) => {
  try {
    res.status(200).json(req.app.locals.fileConfig);
  } catch (error) {
    logger.error('[/files] Error getting fileConfig', error);
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

      if (/^file-/.test(file.file_id)) {
        return true;
      }

      return isUUID.safeParse(file.file_id).success;
    });

    if (files.length === 0) {
      res.status(204).json({ message: 'Nothing provided to delete' });
      return;
    }

    await processDeleteRequest({ req, files });

    res.status(200).json({ message: 'Files deleted successfully' });
  } catch (error) {
    logger.error('[/files] Error deleting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const options = {
      headers: {
        // TODO: Client initialization for OpenAI API Authentication
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      responseType: 'stream',
    };

    const fileResponse = await axios.get(`https://api.openai.com/v1/files/${fileId}`, {
      headers: options.headers,
    });
    const { filename } = fileResponse.data;

    const response = await axios.get(`https://api.openai.com/v1/files/${fileId}/content`, options);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).send('Error downloading file');
  }
});

router.post('/', async (req, res) => {
  const file = req.file;
  const metadata = req.body;
  let cleanup = true;

  try {
    filterFile({ req, file });

    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    await processFileUpload({ req, res, file, metadata });
  } catch (error) {
    let message = 'Error processing file';
    logger.error('[/files] Error processing file:', error);
    cleanup = false;

    if (error.message?.includes('file_ids')) {
      message += ': ' + error.message;
    }

    // TODO: delete remote file if it exists
    try {
      await fs.unlink(file.path);
    } catch (error) {
      logger.error('[/files] Error deleting file:', error);
    }
    res.status(500).json({ message });
  }

  if (cleanup) {
    try {
      await fs.unlink(file.path);
    } catch (error) {
      logger.error('[/files/images] Error deleting file after file processing:', error);
    }
  }
});

module.exports = router;
