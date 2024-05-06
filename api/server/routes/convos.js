const multer = require('multer');
const express = require('express');
const { CacheKeys } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/assistants');
const { getConvosByPage, deleteConvos, getConvo, saveConvo } = require('~/models/Conversation');
const { IMPORT_CONVERSATION_JOB_NAME } = require('~/server/utils/import/jobDefinition');
const { storage, importFileFilter } = require('~/server/routes/files/multer');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { forkConversation } = require('~/server/utils/import/fork');
const { createImportLimiters } = require('~/server/middleware');
const jobScheduler = require('~/server/utils/jobScheduler');
const getLogStores = require('~/cache/getLogStores');
const { sleep } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  let pageNumber = req.query.pageNumber || 1;
  pageNumber = parseInt(pageNumber, 10);

  if (isNaN(pageNumber) || pageNumber < 1) {
    return res.status(400).json({ error: 'Invalid page number' });
  }

  let pageSize = req.query.pageSize || 25;
  pageSize = parseInt(pageSize, 10);

  if (isNaN(pageSize) || pageSize < 1) {
    return res.status(400).json({ error: 'Invalid page size' });
  }
  const isArchived = req.query.isArchived === 'true';

  res.status(200).send(await getConvosByPage(req.user.id, pageNumber, pageSize, isArchived));
});

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convo = await getConvo(req.user.id, conversationId);

  if (convo) {
    res.status(200).json(convo);
  } else {
    res.status(404).end();
  }
});

router.post('/gen_title', async (req, res) => {
  const { conversationId } = req.body;
  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;
  let title = await titleCache.get(key);

  if (!title) {
    await sleep(2500);
    title = await titleCache.get(key);
  }

  if (title) {
    await titleCache.delete(key);
    res.status(200).json({ title });
  } else {
    res.status(404).json({
      message: 'Title not found or method not implemented for the conversation\'s endpoint',
    });
  }
});

router.post('/clear', async (req, res) => {
  let filter = {};
  const { conversationId, source, thread_id } = req.body.arg;
  if (conversationId) {
    filter = { conversationId };
  }

  if (source === 'button' && !conversationId) {
    return res.status(200).send('No conversationId provided');
  }

  if (thread_id) {
    /** @type {{ openai: OpenAI}} */
    const { openai } = await initializeClient({ req, res });
    try {
      const response = await openai.beta.threads.del(thread_id);
      logger.debug('Deleted OpenAI thread:', response);
    } catch (error) {
      logger.error('Error deleting OpenAI thread:', error);
    }
  }

  // for debugging deletion source
  // logger.debug('source:', source);

  try {
    const dbResponse = await deleteConvos(req.user.id, filter);
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

router.post('/update', async (req, res) => {
  const update = req.body.arg;

  try {
    const dbResponse = await saveConvo(req.user.id, update);
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error updating conversation', error);
    res.status(500).send('Error updating conversation');
  }
});

const { importIpLimiter, importUserLimiter } = createImportLimiters();
const upload = multer({ storage: storage, fileFilter: importFileFilter });

/**
 * Imports a conversation from a JSON file and saves it to the database.
 * @route POST /import
 * @param {Express.Multer.File} req.file - The JSON file to import.
 * @returns {object} 201 - success response - application/json
 */
router.post(
  '/import',
  importIpLimiter,
  importUserLimiter,
  upload.single('file'),
  async (req, res) => {
    try {
      const filepath = req.file.path;
      const job = await jobScheduler.now(IMPORT_CONVERSATION_JOB_NAME, filepath, req.user.id);

      res.status(201).json({ message: 'Import started', jobId: job.id });
    } catch (error) {
      logger.error('Error processing file', error);
      res.status(500).send('Error processing file');
    }
  },
);

/**
 * POST /fork
 * This route handles forking a conversation based on the TForkConvoRequest and responds with TForkConvoResponse.
 * @route POST /fork
 * @param {express.Request<{}, TForkConvoResponse, TForkConvoRequest>} req - Express request object.
 * @param {express.Response<TForkConvoResponse>} res - Express response object.
 * @returns {Promise<void>} - The response after forking the conversation.
 */
router.post('/fork', async (req, res) => {
  try {
    /** @type {TForkConvoRequest} */
    const { conversationId, messageId, option, splitAtTarget, latestMessageId } = req.body;
    const result = await forkConversation({
      requestUserId: req.user.id,
      originalConvoId: conversationId,
      targetMessageId: messageId,
      latestMessageId,
      records: true,
      splitAtTarget,
      option,
    });

    res.json(result);
  } catch (error) {
    logger.error('Error forking conversation', error);
    res.status(500).send('Error forking conversation');
  }
});

// Get the status of an import job for polling
router.get('/import/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId, ...jobStatus } = await jobScheduler.getJobStatus(jobId);
    if (!jobStatus) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json(jobStatus);
  } catch (error) {
    logger.error('Error getting job details', error);
    res.status(500).send('Error getting job details');
  }
});

module.exports = router;
