const multer = require('multer');
const express = require('express');
const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { getConvosByCursor, deleteConvos, getConvo, saveConvo } = require('~/models/Conversation');
const { forkConversation, duplicateConversation } = require('~/server/utils/import/fork');
const { storage, importFileFilter } = require('~/server/routes/files/multer');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { importConversations } = require('~/server/utils/import');
const { createImportLimiters } = require('~/server/middleware');
const { deleteToolCalls } = require('~/models/ToolCall');
const { isEnabled, sleep } = require('~/server/utils');
const getLogStores = require('~/cache/getLogStores');
const { logger } = require('~/config');

const assistantClients = {
  [EModelEndpoint.azureAssistants]: require('~/server/services/Endpoints/azureAssistants'),
  [EModelEndpoint.assistants]: require('~/server/services/Endpoints/assistants'),
};

const router = express.Router();
router.use(requireJwtAuth);

router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 25;
  const cursor = req.query.cursor;
  const isArchived = isEnabled(req.query.isArchived);
  const search = req.query.search ? decodeURIComponent(req.query.search) : undefined;
  const order = req.query.order || 'desc';

  let tags;
  if (req.query.tags) {
    tags = Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags];
  }

  try {
    const result = await getConvosByCursor(req.user.id, {
      cursor,
      limit,
      isArchived,
      tags,
      search,
      order,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching conversations' });
  }
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
      message: "Title not found or method not implemented for the conversation's endpoint",
    });
  }
});

router.delete('/', async (req, res) => {
  let filter = {};
  const { conversationId, source, thread_id, endpoint } = req.body.arg;

  // Prevent deletion of all conversations
  if (!conversationId && !source && !thread_id && !endpoint) {
    return res.status(400).json({
      error: 'no parameters provided',
    });
  }

  if (conversationId) {
    filter = { conversationId };
  } else if (source === 'button') {
    return res.status(200).send('No conversationId provided');
  }

  if (
    typeof endpoint !== 'undefined' &&
    Object.prototype.propertyIsEnumerable.call(assistantClients, endpoint)
  ) {
    /** @type {{ openai: OpenAI }} */
    const { openai } = await assistantClients[endpoint].initializeClient({ req, res });
    try {
      const response = await openai.beta.threads.del(thread_id);
      logger.debug('Deleted OpenAI thread:', response);
    } catch (error) {
      logger.error('Error deleting OpenAI thread:', error);
    }
  }

  try {
    const dbResponse = await deleteConvos(req.user.id, filter);
    await deleteToolCalls(req.user.id, filter.conversationId);
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

router.delete('/all', async (req, res) => {
  try {
    const dbResponse = await deleteConvos(req.user.id, {});
    await deleteToolCalls(req.user.id);
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

router.post('/update', async (req, res) => {
  const update = req.body.arg;

  if (!update.conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  try {
    const dbResponse = await saveConvo(req, update, {
      context: `POST /api/convos/update ${update.conversationId}`,
    });
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
      /* TODO: optimize to return imported conversations and add manually */
      await importConversations({ filepath: req.file.path, requestUserId: req.user.id });
      res.status(201).json({ message: 'Conversation(s) imported successfully' });
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
    logger.error('Error forking conversation:', error);
    res.status(500).send('Error forking conversation');
  }
});

router.post('/duplicate', async (req, res) => {
  const { conversationId, title } = req.body;

  try {
    const result = await duplicateConversation({
      userId: req.user.id,
      conversationId,
      title,
    });
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error duplicating conversation:', error);
    res.status(500).send('Error duplicating conversation');
  }
});

module.exports = router;
