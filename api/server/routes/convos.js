const multer = require('multer');
const express = require('express');
const { sleep } = require('@librechat/agents');
const {
  isEnabled,
  normalizeLimit,
  openCheckpointDeletion,
  createArchiveAllHandler,
  createSubagentActivityStreamHandler,
  createSubagentControlHandler,
  isValidSubagentControlRequest,
  exemptAgentTriggerFromIpLimiter,
  createParentSubagentIndexHandler,
  createSubagentThreadViewHandler,
  resolveImportMaxFileSize,
  restoreTenantContextFromReq,
  deleteAllSharedLinksWithCleanup,
  deleteConvoSharedLinksWithCleanup,
  createContentFilter,
  isContentFilterError,
  isConversationImportError,
  extractConversationTitleContent,
  extractStoredMessageContent,
  GenerationJobManager,
  isStopConfirmed,
  createConversationDeletionService,
  updateConversationArchiveMetadata,
  updateConversationTitleMetadata,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const {
  createImportLimiters,
  validateConvoAccess,
  createForkLimiters,
  configMiddleware,
  messageIpLimiter,
  messageUserLimiter,
  moderateText,
} = require('~/server/middleware');
const { forkConversation, duplicateConversation } = require('~/server/utils/import/fork');
const { storage, importFileFilter } = require('~/server/routes/files/multer');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { importConversations } = require('~/server/utils/import');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const getLogStores = require('~/cache/getLogStores');
const db = require('~/models');

const assistantClients = {
  [EModelEndpoint.azureAssistants]: require('~/server/services/Endpoints/azureAssistants'),
  [EModelEndpoint.assistants]: require('~/server/services/Endpoints/assistants'),
};

const { deleteConversations, withAgentOwnerDeletionFence, deleteOwnerConversationPersistence } =
  createConversationDeletionService({
    db,
    subagentThreadTaskStore,
    GenerationJobManager,
    openCheckpointDeletion,
    deleteConvoSharedLinksWithCleanup,
    isStopConfirmed,
    logger,
  });

const router = express.Router();
const archiveAllHandler = createArchiveAllHandler({ archiveAllConvos: db.archiveAllConvos });
const subagentThreadViewHandler = createSubagentThreadViewHandler({
  getConvoOwnership: db.getConvoOwnership,
  getSubagentThreadForParent: db.getSubagentThreadForParent,
  getMessagesForSubagentThreadView: db.getMessagesForSubagentThreadView,
});
const parentSubagentIndexHandler = createParentSubagentIndexHandler({
  getConvoOwnership: db.getConvoOwnership,
  listSubagentThreadsForParent: db.listSubagentThreadsForParent,
  listSubagentTasksForThreads: db.listSubagentTasksForThreads,
});
const filterConversationTitle = createContentFilter({
  getFilters: (req) => req.config?.filters,
  extract: (req) => extractConversationTitleContent(req.body),
});
const filterSubagentControlMessage = createContentFilter({
  getFilters: (req) => req.config?.filters,
  getLegacyPii: (req) => req.config?.messageFilter?.pii,
  extract: (req) =>
    ['steer', 'queue', 'interrupt'].includes(req.body?.action)
      ? extractStoredMessageContent({ text: req.body?.message })
      : [],
});
const unless = (isExempt, middleware) => (req, res, next) =>
  isExempt(req) ? next() : middleware(req, res, next);
const subagentControlLimiters = [];
if (isEnabled(process.env.LIMIT_MESSAGE_IP)) {
  subagentControlLimiters.push(unless(exemptAgentTriggerFromIpLimiter, messageIpLimiter));
}
if (isEnabled(process.env.LIMIT_MESSAGE_USER)) {
  subagentControlLimiters.push(messageUserLimiter);
}

function validateSubagentControlRequest(req, res, next) {
  if (!isValidSubagentControlRequest(req.body)) {
    return res.status(400).json({ error: 'Invalid subagent control request' });
  }
  next();
}

/** Present guidance to the existing moderation middleware as ordinary user text.
 * The controller continues to consume `message`; `text` is restored before it runs. */
async function moderateSubagentControlMessage(req, res, next) {
  const body = (req.body ??= {});
  if (!['steer', 'queue', 'interrupt'].includes(body.action)) {
    next();
    return;
  }
  const hadText = Object.prototype.hasOwnProperty.call(body, 'text');
  const originalText = body.text;
  if (typeof body.message === 'string') {
    body.text = body.message;
  }
  const restore = () => {
    if (hadText) {
      body.text = originalText;
    } else {
      delete body.text;
    }
  };
  try {
    await moderateText(req, res, (error) => {
      restore();
      next(error);
    });
  } finally {
    restore();
  }
}
const subagentActivityStreamHandler = createSubagentActivityStreamHandler(
  {
    getConvoOwnership: db.getConvoOwnership,
    getSubagentThreadForParent: db.getSubagentThreadForParent,
    getMessages: db.getMessages,
  },
  {
    subscribe: subagentThreadTaskStore.subscribeActivity.bind(subagentThreadTaskStore),
  },
);
const subagentControlHandler = createSubagentControlHandler({
  getConvoOwnership: db.getConvoOwnership,
  getSubagentThreadForParent: db.getSubagentThreadForParent,
  getMessages: db.getMessages,
  getSubagentTaskControlReceipt: db.getSubagentTaskControlReceipt,
  store: subagentThreadTaskStore,
});
router.use(requireJwtAuth);

const isValidProjectFilter = (projectId) =>
  !projectId || projectId === 'unassigned' || /^[a-f\d]{24}$/i.test(projectId);

router.get('/', async (req, res) => {
  const limit = normalizeLimit(req.query.limit);
  const cursor = req.query.cursor;
  const isArchived = isEnabled(req.query.isArchived);
  const pinned = isEnabled(req.query.pinned);
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined;
  const sortBy = req.query.sortBy || 'updatedAt';
  const sortDirection = req.query.sortDirection || 'desc';
  const projectId = Array.isArray(req.query.projectId)
    ? req.query.projectId[0]
    : req.query.projectId;

  if (!isValidProjectFilter(projectId)) {
    return res.status(400).json({ error: 'projectId must be a valid project id or unassigned' });
  }

  let tags;
  if (req.query.tags) {
    tags = Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags];
  }

  try {
    const result = await db.getConvosByCursor(req.user.id, {
      cursor,
      limit,
      isArchived,
      pinned,
      tags,
      search,
      sortBy,
      sortDirection,
      projectId,
    });
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error fetching conversations', error);
    res.status(500).json({ error: 'Error fetching conversations' });
  }
});

router.get(
  '/:parentConversationId/subagents/:threadId/tasks/:taskId/activity',
  subagentActivityStreamHandler,
);
router.post(
  '/:parentConversationId/subagents/:threadId/control',
  configMiddleware,
  ...subagentControlLimiters,
  validateSubagentControlRequest,
  filterSubagentControlMessage,
  moderateSubagentControlMessage,
  subagentControlHandler,
);
router.get('/:parentConversationId/subagents', parentSubagentIndexHandler);
router.get('/:parentConversationId/subagents/:threadId', subagentThreadViewHandler);

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convo = await db.getConvo(req.user.id, conversationId);

  if (convo && convo.subagentThread == null) {
    res.status(200).json(convo);
  } else {
    res.status(404).end();
  }
});

router.get('/gen_title/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;
  let title = await titleCache.get(key);

  if (!title) {
    // Exponential backoff: 500ms, 1s, 2s, 4s, 8s (total ~15.5s max wait)
    const delays = [500, 1000, 2000, 4000, 8000];
    for (const delay of delays) {
      await sleep(delay);
      title = await titleCache.get(key);
      if (title) {
        break;
      }
    }
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

router.delete('/', configMiddleware, async (req, res) => {
  let filter = {};
  const { conversationId, source, thread_id, endpoint } = req.body?.arg ?? {};

  if (conversationId != null && typeof conversationId !== 'string') {
    return res.status(400).json({ error: 'Invalid conversationId' });
  }

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
      const response = await openai.beta.threads.delete(thread_id);
      logger.debug('Deleted OpenAI thread:', response);
    } catch (error) {
      logger.error('Error deleting OpenAI thread:', error);
    }
  }

  try {
    const tenantId =
      typeof req.user.tenantId === 'string' && req.user.tenantId !== ''
        ? req.user.tenantId
        : undefined;
    const checkpointer = req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer;
    const dbResponse = await deleteConversations(req.user.id, filter, tenantId, checkpointer, {
      allowMissingRoot: true,
    });
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

router.delete('/all', configMiddleware, async (req, res) => {
  try {
    const tenantId =
      typeof req.user.tenantId === 'string' && req.user.tenantId !== ''
        ? req.user.tenantId
        : undefined;
    const checkpointer = req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer;
    /** Fences new child admission for this owner, drains the live ones, and deletes
     * inside that fence: a child admitted on another replica mid-deletion would
     * otherwise keep running against conversations that no longer exist. */
    const fencedDeletion = await withAgentOwnerDeletionFence(
      req.user.id,
      tenantId,
      () => deleteOwnerConversationPersistence(req.user.id, {}, tenantId, checkpointer),
      () => deleteOwnerConversationPersistence(req.user.id, {}, tenantId, checkpointer),
      checkpointer,
    );
    const dbResponse = fencedDeletion.result;
    await db.deleteToolCalls(req.user.id, undefined, tenantId ?? null);
    await deleteAllSharedLinksWithCleanup(req.user.id, tenantId ?? null);
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

/**
 * Archives or unarchives a conversation.
 * @route POST /archive
 * @param {string} req.body.arg.conversationId - The conversation ID to archive/unarchive.
 * @param {boolean} req.body.arg.isArchived - Whether to archive (true) or unarchive (false).
 * @returns {object} 200 - The updated conversation object.
 */
router.post('/archive', validateConvoAccess, async (req, res) => {
  const { conversationId, isArchived } = req.body?.arg ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (typeof isArchived !== 'boolean') {
    return res.status(400).json({ error: 'isArchived must be a boolean' });
  }

  try {
    const dbResponse = await updateConversationArchiveMetadata(db, {
      userId: req.user.id,
      tenantId: req.user.tenantId,
      conversationId,
      isArchived,
      isTemporary: req.resolvedConversation?.isTemporary,
      expiredAt: req.resolvedConversation?.expiredAt,
      interfaceConfig: req.config?.interfaceConfig,
    });

    if (!dbResponse) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(200).json(dbResponse);
  } catch (error) {
    logger.error('Error archiving conversation', error);
    res.status(500).send('Error archiving conversation');
  }
});

/**
 * Archives every conversation currently visible to the user.
 * @route POST /archive/all
 * @returns {object} 200 - The number of conversations archived.
 */
router.post('/archive/all', archiveAllHandler);

router.post('/pin', validateConvoAccess, async (req, res) => {
  const { conversationId, pinned } = req.body?.arg ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (pinned === undefined) {
    return res.status(400).json({ error: 'pinned is required' });
  }

  if (typeof pinned !== 'boolean') {
    return res.status(400).json({ error: 'pinned must be a boolean' });
  }

  try {
    const dbResponse = await db.setConvoPinned(req.user.id, conversationId, pinned);

    if (!dbResponse) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(200).json(dbResponse);
  } catch (error) {
    logger.error('Error pinning conversation', error);
    res.status(500).send('Error pinning conversation');
  }
});

/**
 * Updates a conversation's title.
 * @route POST /update
 * @param {string} req.body.arg.conversationId - The conversation ID to update.
 * @param {string} req.body.arg.title - The new title for the conversation.
 * @returns {object} 201 - The updated conversation object.
 */
router.post('/update', validateConvoAccess, configMiddleware, async (req, res) => {
  const { conversationId, title } = req.body?.arg ?? {};

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  if (title === undefined) {
    return res.status(400).json({ error: 'title is required' });
  }

  if (typeof title !== 'string') {
    return res.status(400).json({ error: 'title must be a string' });
  }

  try {
    const dbResponse = await updateConversationTitleMetadata(db, {
      userId: req.user.id,
      tenantId: req.user.tenantId,
      conversationId,
      title,
      isTemporary: req.resolvedConversation?.isTemporary,
      expiredAt: req.resolvedConversation?.expiredAt,
      filters: req.config?.filters,
      interfaceConfig: req.config?.interfaceConfig,
    });
    if (!dbResponse) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.status(201).json(dbResponse);
  } catch (error) {
    if (isContentFilterError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    logger.error('Error updating conversation', error);
    res.status(500).send('Error updating conversation');
  }
});

const { importIpLimiter, importUserLimiter } = createImportLimiters();
/** Fork and duplicate share one rate-limit budget (same "clone" operation class) */
const { forkIpLimiter, forkUserLimiter } = createForkLimiters();
const importMaxFileSize = resolveImportMaxFileSize();
const upload = multer({
  storage,
  fileFilter: importFileFilter,
  limits: { fileSize: importMaxFileSize },
});
const uploadSingle = upload.single('file');

function handleUpload(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'File exceeds the maximum allowed size' });
    }
    if (err) {
      return next(err);
    }
    next();
  });
}

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
  configMiddleware,
  handleUpload,
  restoreTenantContextFromReq,
  async (req, res) => {
    try {
      /* TODO: optimize to return imported conversations and add manually */
      await importConversations({
        filepath: req.file.path,
        requestUserId: req.user.id,
        userRole: req.user.role,
        interfaceConfig: req.config?.interfaceConfig,
        filters: req.config?.filters,
        ...(req.config?.messageFilter?.pii == null
          ? {}
          : { legacyPii: req.config.messageFilter.pii }),
      });
      res.status(201).json({ message: 'Conversation(s) imported successfully' });
    } catch (error) {
      if (isContentFilterError(error)) {
        return res.status(error.statusCode).json(error.body);
      }
      if (isConversationImportError(error)) {
        return res.status(error.statusCode).json(error.body);
      }
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
router.post('/fork', forkIpLimiter, forkUserLimiter, configMiddleware, async (req, res) => {
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
      filters: req.config?.filters,
      ...(req.config?.messageFilter?.pii == null
        ? {}
        : { legacyPii: req.config.messageFilter.pii }),
    });

    res.json(result);
  } catch (error) {
    if (isContentFilterError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    if (isConversationImportError(error)) {
      return res.status(error.statusCode).json(error.body);
    }
    logger.error('Error forking conversation:', error);
    res.status(500).send('Error forking conversation');
  }
});

router.post(
  '/duplicate',
  forkIpLimiter,
  forkUserLimiter,
  configMiddleware,
  filterConversationTitle,
  async (req, res) => {
    const { conversationId, title } = req.body;

    try {
      const result = await duplicateConversation({
        userId: req.user.id,
        conversationId,
        title,
        filters: req.config?.filters,
        ...(req.config?.messageFilter?.pii == null
          ? {}
          : { legacyPii: req.config.messageFilter.pii }),
      });
      res.status(201).json(result);
    } catch (error) {
      if (isContentFilterError(error)) {
        return res.status(error.statusCode).json(error.body);
      }
      if (isConversationImportError(error)) {
        return res.status(error.statusCode).json(error.body);
      }
      logger.error('Error duplicating conversation:', error);
      res.status(500).send('Error duplicating conversation');
    }
  },
);

module.exports = router;
