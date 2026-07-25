const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const mongoose = require('mongoose');
const { sleep } = require('@librechat/agents');
const {
  isEnabled,
  runImport,
  inspectExport,
  ImportJobStore,
  deleteAgentCheckpoints,
  sanitizeImportError,
  resolveImportMaxFileSize,
  restoreTenantContextFromReq,
  deleteAllSharedLinksWithCleanup,
  deleteConvoSharedLinksWithCleanup,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const {
  createImportLimiters,
  validateConvoAccess,
  createForkLimiters,
  configMiddleware,
} = require('~/server/middleware');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { createImportBatchBuilder } = require('~/server/utils/import/importBatchBuilder');
const { forkConversation, duplicateConversation } = require('~/server/utils/import/fork');
const { resolveImportDefaultModel } = require('~/server/utils/import/defaults');
const { importStorage, importFileFilter } = require('~/server/routes/files/multer');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { importConversations } = require('~/server/utils/import');
const getLogStores = require('~/cache/getLogStores');
const db = require('~/models');

const assistantClients = {
  [EModelEndpoint.azureAssistants]: require('~/server/services/Endpoints/azureAssistants'),
  [EModelEndpoint.assistants]: require('~/server/services/Endpoints/assistants'),
};

const router = express.Router();
router.use(requireJwtAuth);

const isValidProjectFilter = (projectId) =>
  !projectId || projectId === 'unassigned' || /^[a-f\d]{24}$/i.test(projectId);

router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 25;
  const cursor = req.query.cursor;
  const isArchived = isEnabled(req.query.isArchived);
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

router.get('/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const convo = await db.getConvo(req.user.id, conversationId);

  if (convo) {
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
    const dbResponse = await db.deleteConvos(req.user.id, filter);
    // HITL: prune the deleted conversations' durable checkpoints — a paused run's
    // checkpoint would otherwise persist until the Mongo TTL. Never throws.
    await deleteAgentCheckpoints(
      dbResponse.conversationIds,
      req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
    );
    if (filter.conversationId) {
      await db.deleteToolCalls(req.user.id, filter.conversationId);
      await deleteConvoSharedLinksWithCleanup(req.user.id, filter.conversationId);
    }
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error clearing conversations', error);
    res.status(500).send('Error clearing conversations');
  }
});

router.delete('/all', configMiddleware, async (req, res) => {
  try {
    const dbResponse = await db.deleteConvos(req.user.id, {});
    // HITL: prune ALL the deleted conversations' durable checkpoints in one bulk pass.
    await deleteAgentCheckpoints(
      dbResponse.conversationIds,
      req.config?.endpoints?.[EModelEndpoint.agents]?.checkpointer,
    );
    await db.deleteToolCalls(req.user.id);
    await deleteAllSharedLinksWithCleanup(req.user.id);
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
    const dbResponse = await db.saveConvo(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      { conversationId, isArchived },
      { context: `POST /api/convos/archive ${conversationId}` },
    );
    res.status(200).json(dbResponse);
  } catch (error) {
    logger.error('Error archiving conversation', error);
    res.status(500).send('Error archiving conversation');
  }
});

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
    const dbResponse = await db.saveConvo(
      { userId: req.user.id },
      { conversationId, pinned },
      { context: `POST /api/convos/pin ${conversationId}` },
    );
    res.status(200).json(dbResponse);
  } catch (error) {
    logger.error('Error pinning conversation', error);
    res.status(500).send('Error pinning conversation');
  }
});

/** Maximum allowed length for conversation titles */
const MAX_CONVO_TITLE_LENGTH = 1024;

/**
 * Updates a conversation's title.
 * @route POST /update
 * @param {string} req.body.arg.conversationId - The conversation ID to update.
 * @param {string} req.body.arg.title - The new title for the conversation.
 * @returns {object} 201 - The updated conversation object.
 */
router.post('/update', validateConvoAccess, async (req, res) => {
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

  const sanitizedTitle = title.trim().slice(0, MAX_CONVO_TITLE_LENGTH);

  try {
    const dbResponse = await db.saveConvo(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      { conversationId, title: sanitizedTitle },
      { context: `POST /api/convos/update ${conversationId}` },
    );
    res.status(201).json(dbResponse);
  } catch (error) {
    logger.error('Error updating conversation', error);
    res.status(500).send('Error updating conversation');
  }
});

const { importIpLimiter, importUserLimiter } = createImportLimiters();
/** Fork and duplicate share one rate-limit budget (same "clone" operation class) */
const { forkIpLimiter, forkUserLimiter } = createForkLimiters();
const importMaxFileSize = resolveImportMaxFileSize();
const upload = multer({
  storage: importStorage,
  fileFilter: importFileFilter,
  limits: { fileSize: importMaxFileSize },
});
const uploadSingle = upload.single('file');
const importJobs = new ImportJobStore(getLogStores(CacheKeys.IMPORT_JOBS));

function handleUpload(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'File exceeds the maximum allowed size' });
    }
    if (err) {
      return res.status(400).json({
        message: sanitizeImportError(err, `Import upload rejected for user ${req.user?.id}`),
      });
    }
    next();
  });
}

/**
 * Existing `importedFrom.externalId` values already saved for this user, used
 * to skip conversations a prior (interrupted or re-run) import already wrote.
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
async function loadExistingExternalIds(userId) {
  const Conversation = mongoose.models.Conversation;
  const rows = await Conversation.find(
    { user: userId, 'importedFrom.source': 'chatgpt' },
    { 'importedFrom.externalId': 1 },
  ).lean();
  return new Set(rows.map((row) => row.importedFrom?.externalId).filter(Boolean));
}

/**
 * Runs a confirmed import job to completion in the background, updating the
 * job record as it progresses. Never throws: failures are recorded on the job
 * itself so a polling client observes a `failed` phase instead of a dropped
 * connection. Every step — including building the storage strategy and
 * batch builder — runs inside the try/finally so a synchronous setup
 * failure still marks the job `failed` and still cleans up the temp file,
 * instead of leaving the job pinned at `phase: 'conversations'` forever.
 * @param {object} req - The Express request that created/confirmed the job.
 * @param {import('@librechat/api').ImportJob} job
 * @returns {Promise<void>}
 */
async function runImportJob(req, job) {
  try {
    const appConfig = req.config;
    const source = getFileStrategy(appConfig, { isImage: true });
    const { saveBuffer } = getStrategyFunctions(source);
    const batch = createImportBatchBuilder(req.user.id, appConfig?.interfaceConfig);

    const defaultModel = await resolveImportDefaultModel({
      endpoint: EModelEndpoint.openAI,
      requestUserId: req.user.id,
      userRole: req.user.role,
    });

    const report = await runImport({
      filepath: job.filepath,
      userId: req.user.id,
      tenantId: req.user.tenantId,
      source,
      defaultModel,
      deps: { saveBuffer, createFile: db.createFile },
      batch,
      existingExternalIds: await loadExistingExternalIds(req.user.id),
      isCancelled: () => importJobs.isCancelled(req.user.id, job.jobId),
      onProgress: async (progress) => {
        await importJobs.patch(req.user.id, job.jobId, { progress });
      },
      onPhase: async (phase) => {
        if (await importJobs.isCancelled(req.user.id, job.jobId)) {
          return;
        }
        await importJobs.patch(req.user.id, job.jobId, { phase });
      },
    });

    /**
     * `runImport` returns normally when the cancel flag breaks its loop, so
     * the completion patch has to check: a cancelled job keeps its
     * `cancelled` phase and only gains the partial report describing what
     * was already written.
     */
    const current = await importJobs.get(req.user.id, job.jobId);
    if (current?.status === 'cancelled') {
      await importJobs.patch(req.user.id, job.jobId, { report });
      return;
    }

    await importJobs.patch(req.user.id, job.jobId, {
      report,
      phase: 'completed',
      status: 'completed',
    });
  } catch (error) {
    const message = sanitizeImportError(
      error,
      `Import job ${job.jobId} failed for user ${req.user.id}`,
    );
    await importJobs.patch(req.user.id, job.jobId, {
      phase: 'failed',
      status: 'failed',
      error: message,
    });
  } finally {
    await fs.promises.unlink(job.filepath).catch(() => undefined);
  }
}

/**
 * Imports a bare ChatGPT-legacy export synchronously through the old,
 * un-jobbed importer. Reached only for uploads that are neither a zip nor
 * recognizable ChatGPT content: Claude, ChatbotUI, and LibreChat exports
 * are all detected by CONTENT (`getImporter`, invoked inside
 * `importConversations`), not by file extension.
 * @param {object} req
 * @param {object} res
 * @returns {Promise<void>}
 */
async function importLegacyConversation(req, res) {
  try {
    /* TODO: optimize to return imported conversations and add manually */
    await importConversations({
      filepath: req.file.path,
      requestUserId: req.user.id,
      userRole: req.user.role,
      interfaceConfig: req.config?.interfaceConfig,
    });
    res.status(201).json({ message: 'Conversation(s) imported successfully' });
  } catch (error) {
    logger.error('Error processing file', error);
    res.status(500).send('Error processing file');
  }
}

/**
 * Imports a conversation export and saves it to the database.
 *
 * `.zip` uploads and bare `.json` ChatGPT exports share one pipeline:
 * `openArchive` wraps a non-zip file in a single-entry archive, so
 * `inspectExport` sees the same shape either way and this request only
 * inspects the upload and returns a summary awaiting confirmation — the
 * actual import runs after POST /import/jobs/:jobId/start. A bare `.json`
 * upload that is not ChatGPT-shaped (Claude, ChatbotUI, LibreChat) falls
 * back to the legacy synchronous importer, since `inspectExport`/`runImport`
 * only understand the ChatGPT export layout.
 * @route POST /import
 * @param {Express.Multer.File} req.file - The uploaded export file.
 * @returns {object} 201 - legacy (non-ChatGPT) JSON import succeeded
 * @returns {object} 202 - archive inspected, job awaiting confirmation
 * @returns {object} 400 - the upload could not be read as any supported format
 */
router.post(
  '/import',
  importIpLimiter,
  importUserLimiter,
  configMiddleware,
  handleUpload,
  restoreTenantContextFromReq,
  async (req, res) => {
    const isZip = path.extname(req.file.originalname).toLowerCase() === '.zip';

    let inspected;
    try {
      inspected = await inspectExport(req.file.path);
    } catch (error) {
      if (!isZip && error instanceof Error && error.message === 'Unsupported import type') {
        await importLegacyConversation(req, res);
        return;
      }
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({
        message: sanitizeImportError(error, `Error inspecting import file for user ${req.user.id}`),
      });
      return;
    }

    try {
      const job = await importJobs.create({
        userId: req.user.id,
        filepath: req.file.path,
        filename: req.file.originalname,
      });
      const updated = await importJobs.patch(req.user.id, job.jobId, {
        summary: inspected.summary,
        phase: 'awaiting_confirmation',
      });
      res.status(202).json({ jobId: job.jobId, summary: updated.summary });
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      res.status(400).json({
        message: sanitizeImportError(error, `Error creating import job for user ${req.user.id}`),
      });
    }
  },
);

/**
 * Confirms an inspected import job and starts running it in the background.
 * The phase transition out of `awaiting_confirmation` is atomic (see
 * `ImportJobStore.confirmStart`), so a second `/start` call for the same
 * job — a double-click, a client retry, a replay — never launches a
 * second background run over the same archive: `importedFrom` is not a
 * unique index (a deliberate choice, see Task 13), so a duplicate run
 * would otherwise duplicate conversations the first run has not yet
 * committed.
 * @route POST /import/jobs/:jobId/start
 * @returns {object} 202 - the job has started
 * @returns {object} 404 - no such job for this user
 * @returns {object} 409 - the job already started, completed, failed, or was cancelled
 */
router.post('/import/jobs/:jobId/start', configMiddleware, async (req, res) => {
  const result = await importJobs.confirmStart(req.user.id, req.params.jobId);

  if (result.status === 'not_found') {
    res.status(404).json({ message: 'Import job not found' });
    return;
  }
  if (result.status === 'conflict') {
    res.status(409).json({ message: 'Import job is not awaiting confirmation' });
    return;
  }

  res.status(202).json({ jobId: result.job.jobId });

  runImportJob(req, result.job);
});

/**
 * Returns the status of an import job. `filepath` and `userId` are always
 * stripped: the former is a server filesystem path that must never reach a
 * client, and the latter is redundant once the route is scoped to `req.user.id`.
 * @route GET /import/jobs/:jobId
 * @returns {object} 200 - the job status
 * @returns {object} 404 - no such job for this user (also returned once the
 *   job's TTL has expired, since an expired job is indistinguishable from one
 *   that never existed; a polling client should treat both as "stop polling"
 *   rather than hang waiting for a state that will never arrive)
 */
router.get('/import/jobs/:jobId', async (req, res) => {
  const job = await importJobs.get(req.user.id, req.params.jobId);
  if (!job) {
    res.status(404).json({ message: 'Import job not found' });
    return;
  }
  const { filepath: _filepath, userId: _userId, ...safe } = job;
  res.status(200).json(safe);
});

/**
 * Cancels an import job. The temporary upload is removed here only for a
 * job that never started: once `runImportJob` owns the archive its
 * `finally` removes it, and deleting the file out from under a running
 * import turns a clean cancellation into an `ENOENT` failure.
 * @route DELETE /import/jobs/:jobId
 * @returns {object} 200 - the job was cancelled
 * @returns {object} 404 - no such job for this user
 */
router.delete('/import/jobs/:jobId', async (req, res) => {
  const job = await importJobs.get(req.user.id, req.params.jobId);
  if (!job) {
    res.status(404).json({ message: 'Import job not found' });
    return;
  }
  await importJobs.cancel(req.user.id, job.jobId);
  if (job.phase === 'awaiting_confirmation') {
    await fs.promises.unlink(job.filepath).catch(() => undefined);
  }
  res.status(200).json({ jobId: job.jobId });
});

/**
 * POST /fork
 * This route handles forking a conversation based on the TForkConvoRequest and responds with TForkConvoResponse.
 * @route POST /fork
 * @param {express.Request<{}, TForkConvoResponse, TForkConvoRequest>} req - Express request object.
 * @param {express.Response<TForkConvoResponse>} res - Express response object.
 * @returns {Promise<void>} - The response after forking the conversation.
 */
router.post('/fork', forkIpLimiter, forkUserLimiter, async (req, res) => {
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

router.post('/duplicate', forkIpLimiter, forkUserLimiter, async (req, res) => {
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
