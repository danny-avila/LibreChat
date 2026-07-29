const fs = require('fs');
const path = require('path');
const multer = require('multer');
const express = require('express');
const mongoose = require('mongoose');
const { sleep } = require('@librechat/agents');
const {
  isEnabled,
  runImport,
  GROK_SOURCE,
  GROK_ENDPOINT,
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

/**
 * Imports running right now, per user. A run decompresses and JSON-parses a
 * whole shard, which peaks at several times the shard's size in heap, so
 * letting one account start its 50 uploaded archives at once is an OOM rather
 * than a slow import. Process-local by design: it bounds what a single node
 * will take on, which is exactly the resource being protected.
 */
const activeImports = new Map();
const MAX_CONCURRENT_IMPORTS_PER_USER = 1;

function activeImportCount(userId) {
  return activeImports.get(userId) ?? 0;
}

function trackImportStart(userId) {
  activeImports.set(userId, activeImportCount(userId) + 1);
}

function trackImportEnd(userId) {
  const remaining = activeImportCount(userId) - 1;
  if (remaining > 0) {
    activeImports.set(userId, remaining);
    return;
  }
  activeImports.delete(userId);
}

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
 * Scoped to the export's own source: a ChatGPT conversation id can never
 * collide with a Claude one, and treating them as one namespace would let one
 * provider's ids suppress the other's.
 * @param {string} userId
 * @param {string} source - `importedFrom.source` of the export being imported.
 * @returns {Promise<Set<string>>}
 */
async function loadExistingExternalIds(userId, source) {
  const Conversation = mongoose.models.Conversation;
  /** `_id: 0` is what makes this a covered query: without it Mongo fetches
   * every matching document off disk to read one 36-character string, which
   * for a user with 100k imported conversations is 50-200 MB of collection
   * reads and an equivalent eviction from the WiredTiger cache. The cursor
   * avoids materializing the whole result set before the Set is built. */
  const cursor = Conversation.find(
    { user: userId, 'importedFrom.source': source },
    { 'importedFrom.externalId': 1, _id: 0 },
  )
    .lean()
    .cursor();

  const ids = new Set();
  for await (const row of cursor) {
    const externalId = row.importedFrom?.externalId;
    if (externalId) {
      ids.add(externalId);
    }
  }
  return ids;
}

/**
 * The converter, endpoint and `importedFrom.source` a confirmed job needs,
 * derived from the summary `inspectExport` already recorded on it. Passing the
 * format through means `runImport` never re-reads a shard just to re-learn a
 * shape the inspect step already established.
 * @param {import('@librechat/api').ImportJob} job
 * @returns {{ format: string, endpoint: string, source: string }}
 */
function resolveJobTarget(job) {
  switch (job.summary?.source) {
    case 'claude':
      return { format: 'claude', endpoint: EModelEndpoint.anthropic, source: 'claude' };
    /** xAI has no first-class endpoint, so Grok conversations land on OpenAI —
     * see `GROK_ENDPOINT`, which this must stay in step with. */
    case 'grok':
      return { format: 'grok', endpoint: GROK_ENDPOINT, source: GROK_SOURCE };
    case 'chatgpt':
    case 'chatgpt-legacy':
      return { format: 'chatgpt', endpoint: EModelEndpoint.openAI, source: 'chatgpt' };
    /** Defaulting to chatgpt would be worse than failing: `source` also scopes
     * the already-imported id lookup, so a Claude archive that fell through
     * here would compare against the chatgpt namespace, find nothing, and
     * duplicate every conversation on each re-import. */
    default:
      throw new Error('Import job has no inspected summary');
  }
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
async function runImportJob(context, job) {
  const { userId, userRole, tenantId, appConfig } = context;
  try {
    /**
     * `sweepStaleTempUploads` deletes temp uploads by mtime alone, and the job
     * TTL matches its age cutoff — so a job confirmed just short of a day after
     * its upload would have its archive removed out from under the run. Marking
     * the file as touched when the run claims it restarts that clock, which is
     * the only signal the sweep can see.
     */
    await fs.promises.utimes(job.filepath, new Date(), new Date()).catch(() => undefined);

    const source = getFileStrategy(appConfig, { isImage: true });
    const { saveBuffer } = getStrategyFunctions(source);
    const batch = createImportBatchBuilder(userId, appConfig?.interfaceConfig);
    const target = resolveJobTarget(job);

    const defaultModel = await resolveImportDefaultModel({
      endpoint: target.endpoint,
      requestUserId: userId,
      userRole,
    });

    const report = await runImport({
      filepath: job.filepath,
      userId,
      tenantId,
      source,
      format: target.format,
      defaultModel,
      deps: { saveBuffer, createFile: db.createFile },
      batch,
      existingExternalIds: await loadExistingExternalIds(userId, target.source),
      isCancelled: () => importJobs.isCancelled(userId, job.jobId),
      onProgress: async (progress) => {
        await importJobs.patch(userId, job.jobId, { progress });
      },
      onPhase: async (phase) => {
        if (await importJobs.isCancelled(userId, job.jobId)) {
          return;
        }
        await importJobs.patch(userId, job.jobId, { phase });
      },
    });

    /**
     * `runImport` returns normally when the cancel flag breaks its loop, so
     * the completion patch has to check: a cancelled job keeps its
     * `cancelled` phase and only gains the partial report describing what
     * was already written.
     */
    const current = await importJobs.get(userId, job.jobId);
    if (current?.status === 'cancelled') {
      await importJobs.patch(userId, job.jobId, { report });
      return;
    }

    await importJobs.patch(userId, job.jobId, {
      report,
      phase: 'completed',
      status: 'completed',
    });
  } catch (error) {
    const message = sanitizeImportError(error, `Import job ${job.jobId} failed for user ${userId}`);
    /** The recovery patch is best-effort: it writes to the same store whose
     * unavailability is the likeliest reason we are in this catch, and a
     * rejection here would escape a function nobody awaits. */
    await importJobs
      .patch(userId, job.jobId, { phase: 'failed', status: 'failed', error: message })
      .catch((patchError) =>
        logger.error(`[runImportJob] Could not record the failure of job ${job.jobId}`, patchError),
      );
  } finally {
    trackImportEnd(userId);
    await fs.promises.unlink(job.filepath).catch(() => undefined);
  }
}

/**
 * Imports a bare export synchronously through the old, un-jobbed importer.
 * Reached only for uploads that are neither a zip nor recognizable ChatGPT,
 * Claude or Grok content: ChatbotUI and LibreChat exports are detected by CONTENT
 * (`getImporter`, invoked inside `importConversations`), not by file extension.
 * The `.zip` exclusion is load-bearing — this path reads `req.file.path` as
 * JSON, which no archive can satisfy.
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
 * `.zip` uploads and bare `.json` ChatGPT, Claude and Grok exports share one
 * pipeline: `openArchive` wraps a non-zip file in a single-entry archive, so
 * `inspectExport` sees the same shape either way and this request only
 * inspects the upload and returns a summary awaiting confirmation — the
 * actual import runs after POST /import/jobs/:jobId/start. A bare `.json`
 * upload matching none of those shapes (ChatbotUI, LibreChat) falls back to
 * the legacy synchronous importer, which is the only path that understands
 * those layouts.
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
    /** Multer leaves `req.file` undefined for a non-multipart body or a
     * multipart body with no `file` part, and reports neither as an error — so
     * without this the handler throws a TypeError and the client gets a 500
     * with no JSON message for what is plainly a bad request. */
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

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
router.post(
  '/import/jobs/:jobId/start',
  importIpLimiter,
  importUserLimiter,
  configMiddleware,
  async (req, res) => {
    const result = await importJobs.confirmStart(req.user.id, req.params.jobId);

    if (result.status === 'not_found') {
      res.status(404).json({ message: 'Import job not found' });
      return;
    }
    /** A replay of the job that is already running lands here, not on the
     * concurrency check below: it has left `awaiting_confirmation`, so the
     * honest answer is that this job already started. */
    if (result.status === 'conflict') {
      res.status(409).json({ message: 'Import job is not awaiting confirmation' });
      return;
    }

    /** Checked after the transition so it only ever rejects a *different*
     * import. The job is handed back to `awaiting_confirmation` rather than
     * failed, so the user can start it once the running one finishes. */
    if (activeImportCount(req.user.id) >= MAX_CONCURRENT_IMPORTS_PER_USER) {
      await importJobs.patch(req.user.id, result.job.jobId, { phase: 'awaiting_confirmation' });
      res.status(429).json({ message: 'Another import is already running' });
      return;
    }

    /** Everything the background run needs, read while the request is still
     * the thing being handled. Holding `req` instead would pin the socket and
     * its buffers for the length of a multi-minute import, per concurrent job. */
    const context = {
      userId: req.user.id,
      userRole: req.user.role,
      tenantId: req.user.tenantId,
      appConfig: req.config,
    };

    trackImportStart(context.userId);
    res.status(202).json({ jobId: result.job.jobId });

    /** Detached on purpose, so the terminal catch is the only thing standing
     * between a rejection in the run's own error handling and an unhandled
     * rejection in a process that serves live chat streams. */
    runImportJob(context, result.job).catch((error) => {
      logger.error(`[startImportJob] Background import job ${result.job.jobId} crashed`, error);
    });
  },
);

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
