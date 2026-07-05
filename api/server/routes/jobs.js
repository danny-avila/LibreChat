const crypto = require('crypto');
const express = require('express');
const { generateCheckAccess } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  createAgentJob,
  getAgentJobById,
  listAgentJobs,
  cancelAgentJob,
  resolveClientOp,
  getRoleByName,
  saveConvo,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const configMiddleware = require('~/server/middleware/config/app');
const { subscribeToJob, publishJobUpdate } = require('~/server/services/Jobs/events');

const router = express.Router();

/** How often to send an SSE comment so proxies keep the connection open. */
const SSE_HEARTBEAT_MS = 25_000;

/** Terminal statuses — once a job reaches one, the SSE stream can close. */
const TERMINAL_STATUSES = new Set(['done', 'error', 'canceled']);

/**
 * Long-horizon jobs run through the agents pipeline, so gate on the same
 * capability the agent runtime requires.
 */
const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkAgentAccess);

/** List the caller's jobs, optionally filtered by status (?status=running,queued). */
router.get('/', async (req, res) => {
  try {
    const statuses =
      typeof req.query.status === 'string' && req.query.status.length > 0
        ? req.query.status.split(',')
        : undefined;
    const conversationId =
      typeof req.query.conversationId === 'string' && req.query.conversationId.length > 0
        ? req.query.conversationId
        : undefined;
    const jobs = await listAgentJobs({
      userId: req.user.id,
      tenantId: req.user.tenantId,
      statuses,
      conversationId,
    });
    res.json({ jobs });
  } catch (error) {
    logger.error('[jobs] list error:', error);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

/** Create a long-horizon job. The worker picks it up on its next tick. */
router.post('/', async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!body.goal || typeof body.goal !== 'string') {
      return res.status(400).json({ error: 'goal is required' });
    }
    const conversationId = body.conversationId || crypto.randomUUID();
    const job = await createAgentJob({
      user: req.user.id,
      tenantId: req.user.tenantId,
      conversationId,
      goal: body.goal,
      agent_id: body.agent_id,
      endpoint: body.endpoint,
      endpointType: body.endpointType,
      model: body.model,
      spec: body.spec,
      maxSteps: typeof body.maxSteps === 'number' ? body.maxSteps : undefined,
    });

    await saveConvo(
      { userId: req.user.id, interfaceConfig: req.config?.interfaceConfig },
      { conversationId, title: body.goal.slice(0, 100) },
      { context: 'jobs.create - ensure convo' },
    );

    res.status(201).json({ job });
  } catch (error) {
    logger.error('[jobs] create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create job' });
  }
});

/** Fetch a single owner-scoped job (status + steps). */
router.get('/:id', async (req, res) => {
  try {
    const job = await getAgentJobById(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ job });
  } catch (error) {
    logger.error('[jobs] get error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

/**
 * Live progress stream for a job (Server-Sent Events).
 *
 * On connect it first replays a `snapshot` event with the job's current status
 * and steps — so a tab that was closed while the job ran shows everything that
 * happened on reopen — then relays `update` events as the worker advances the
 * job. The stream closes automatically once the job is terminal.
 */
router.get('/:id/events', async (req, res) => {
  const job = await getAgentJobById(req.params.id, req.user.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('snapshot', { job });

  if (TERMINAL_STATUSES.has(job.status)) {
    return res.end();
  }

  const unsubscribe = subscribeToJob(req.params.id, (payload) => {
    send('update', payload);
    if (payload.job && TERMINAL_STATUSES.has(payload.job.status)) {
      cleanup();
      res.end();
    }
  });

  const heartbeat = setInterval(() => res.write(': ping\n\n'), SSE_HEARTBEAT_MS);
  heartbeat.unref?.();

  function cleanup() {
    clearInterval(heartbeat);
    unsubscribe();
  }

  req.on('close', cleanup);
});

/** Cancel a running/queued job. */
router.post('/:id/cancel', async (req, res) => {
  try {
    const job = await cancelAgentJob(req.params.id, req.user.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or already finished' });
    }
    publishJobUpdate(req.params.id, { type: 'status', job });
    res.json({ job });
  } catch (error) {
    logger.error('[jobs] cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

/**
 * Browser client posts the outcome of a pending local file operation
 * (Feature 1 — File System Access API bridge).
 */
router.post('/:id/client-op-result', async (req, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body.success !== 'boolean') {
      return res.status(400).json({ error: 'success is required' });
    }

    const job = await resolveClientOp(req.params.id, req.user.id, {
      success: body.success,
      result: body.result,
      error: typeof body.error === 'string' ? body.error : undefined,
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found or no pending client operation' });
    }

    publishJobUpdate(req.params.id, { type: 'status', job });
    res.json({ job });
  } catch (error) {
    logger.error('[jobs] client-op-result error:', error);
    res.status(500).json({ error: 'Failed to record client operation result' });
  }
});

module.exports = router;
