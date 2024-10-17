const fs = require('fs').promises;
const express = require('express');
const { EnvVar } = require('@librechat/agents');
const {
  isUUID,
  FileSources,
  EModelEndpoint,
  isAgentsEndpoint,
  checkOpenAIStorage,
} = require('librechat-data-provider');
const {
  filterFile,
  processFileUpload,
  processDeleteRequest,
  processAgentFileUpload,
} = require('~/server/services/Files/process');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getOpenAIClient } = require('~/server/controllers/assistants/helpers');
const { loadAuthValues } = require('~/app/clients/tools/util');
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

      if (/^(file|assistant)-/.test(file.file_id)) {
        return true;
      }

      return isUUID.safeParse(file.file_id).success;
    });

    if (files.length === 0) {
      res.status(204).json({ message: 'Nothing provided to delete' });
      return;
    }

    await processDeleteRequest({ req, files });

    logger.debug(
      `[/files] Files deleted successfully: ${files
        .filter((f) => f.file_id)
        .map((f) => f.file_id)
        .join(', ')}`,
    );
    res.status(200).json({ message: 'Files deleted successfully' });
  } catch (error) {
    logger.error('[/files] Error deleting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.get('/code/download/:sessionId/:fileId', async (req, res) => {
  try {
    const { sessionId, fileId } = req.params;
    const logPrefix = `Session ID: ${sessionId} | File ID: ${fileId} | Code output download requested by user `;
    logger.debug(logPrefix);

    if (!sessionId || !fileId) {
      return res.status(400).send('Bad request');
    }

    const { getDownloadStream } = getStrategyFunctions(FileSources.execute_code);
    if (!getDownloadStream) {
      logger.warn(
        `${logPrefix} has no stream method implemented for ${FileSources.execute_code} source`,
      );
      return res.status(501).send('Not Implemented');
    }

    const result = await loadAuthValues({ userId: req.user.id, authFields: [EnvVar.CODE_API_KEY] });

    /** @type {AxiosResponse<ReadableStream> | undefined} */
    const response = await getDownloadStream(`${sessionId}/${fileId}`, result[EnvVar.CODE_API_KEY]);
    res.set(response.headers);
    response.data.pipe(res);
  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).send('Error downloading file');
  }
});

router.get('/download/:userId/:file_id', async (req, res) => {
  try {
    const { userId, file_id } = req.params;
    logger.debug(`File download requested by user ${userId}: ${file_id}`);

    if (userId !== req.user.id) {
      logger.warn(`${errorPrefix} forbidden: ${file_id}`);
      return res.status(403).send('Forbidden');
    }

    const [file] = await getFiles({ file_id });
    const errorPrefix = `File download requested by user ${userId}`;

    if (!file) {
      logger.warn(`${errorPrefix} not found: ${file_id}`);
      return res.status(404).send('File not found');
    }

    if (!file.filepath.includes(userId)) {
      logger.warn(`${errorPrefix} forbidden: ${file_id}`);
      return res.status(403).send('Forbidden');
    }

    if (checkOpenAIStorage(file.source) && !file.model) {
      logger.warn(`${errorPrefix} has no associated model: ${file_id}`);
      return res.status(400).send('The model used when creating this file is not available');
    }

    const { getDownloadStream } = getStrategyFunctions(file.source);
    if (!getDownloadStream) {
      logger.warn(`${errorPrefix} has no stream method implemented: ${file.source}`);
      return res.status(501).send('Not Implemented');
    }

    const setHeaders = () => {
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-File-Metadata', JSON.stringify(file));
    };

    /** @type {{ body: import('stream').PassThrough } | undefined} */
    let passThrough;
    /** @type {ReadableStream | undefined} */
    let fileStream;

    if (checkOpenAIStorage(file.source)) {
      req.body = { model: file.model };
      const endpointMap = {
        [FileSources.openai]: EModelEndpoint.assistants,
        [FileSources.azure]: EModelEndpoint.azureAssistants,
      };
      const { openai } = await getOpenAIClient({
        req,
        res,
        overrideEndpoint: endpointMap[file.source],
      });
      logger.debug(`Downloading file ${file_id} from OpenAI`);
      passThrough = await getDownloadStream(file_id, openai);
      setHeaders();
      logger.debug(`File ${file_id} downloaded from OpenAI`);
      passThrough.body.pipe(res);
    } else {
      fileStream = getDownloadStream(file_id);
      setHeaders();
      fileStream.pipe(res);
    }
  } catch (error) {
    logger.error('Error downloading file:', error);
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

    if (isAgentsEndpoint(metadata.endpoint)) {
      return await processAgentFileUpload({ req, res, file, metadata });
    }

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
      logger.error('[/files] Error deleting file after file processing:', error);
    }
  }
});

module.exports = router;
