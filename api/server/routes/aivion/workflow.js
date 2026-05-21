/**
 * Aivion Workflow proxy — forwards authenticated requests to sheru-platform services.
 * All routes require LibreChat JWT. The user's Clerk ID (stored as openidId by OIDC) is
 * forwarded as X-User-Id so the workflow engine can scope runs to the correct user.
 */
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const BACKEND_URL = process.env.SHERU_BACKEND_URL || 'http://sheru-platform-backend:8001';
const WORKFLOW_URL = process.env.SHERU_WORKFLOW_URL || 'http://sheru-platform-workflow:8004';
const SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'dev-internal-token-rotate-me';

function serviceHeaders(req) {
  return {
    Authorization: `Bearer ${SERVICE_TOKEN}`,
    'X-User-Id': req.user?.openidId || req.user?.id || 'unknown',
    'Content-Type': 'application/json',
  };
}

// GET /api/aivion/workflow/runs → sheru-platform-backend /admin/api/v1/workspace/runs (history list)
router.get('/runs', async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.workflow_id) params.set('workflow_id', req.query.workflow_id);
    if (req.query.limit) params.set('limit', req.query.limit);
    if (req.query.offset) params.set('offset', req.query.offset);
    if (req.query.status) params.set('status', req.query.status);
    const { data } = await axios.get(
      `${BACKEND_URL}/admin/api/v1/workspace/runs?${params}`,
      { headers: serviceHeaders(req) },
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// GET /api/aivion/workflow/workflows → sheru-platform-workflow /v1/workflows (includes is_runnable)
router.get('/workflows', async (req, res) => {
  try {
    const { data } = await axios.get(`${WORKFLOW_URL}/v1/workflows`, {
      headers: serviceHeaders(req),
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// GET /api/aivion/workflow/workflows/:workflowId → sheru-platform-backend /admin/api/v1/workspace/workflows/:workflowId
router.get('/workflows/:workflowId', async (req, res) => {
  try {
    const { data } = await axios.get(
      `${BACKEND_URL}/admin/api/v1/workspace/workflows/${req.params.workflowId}`,
      { headers: serviceHeaders(req) },
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// POST /api/aivion/workflow/runs → sheru-platform-workflow /v1/workflow-runs
router.post('/runs', async (req, res) => {
  try {
    const { data } = await axios.post(`${WORKFLOW_URL}/v1/workflow-runs`, req.body, {
      headers: serviceHeaders(req),
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// GET /api/aivion/workflow/runs/:runId → sheru-platform-workflow /v1/workflow-runs/:runId
router.get('/runs/:runId', async (req, res) => {
  try {
    const { data } = await axios.get(`${WORKFLOW_URL}/v1/workflow-runs/${req.params.runId}`, {
      headers: serviceHeaders(req),
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// POST /api/aivion/workflow/runs/:runId/resume
router.post('/runs/:runId/resume', async (req, res) => {
  try {
    const { data } = await axios.post(
      `${WORKFLOW_URL}/v1/workflow-runs/${req.params.runId}/resume`,
      req.body,
      { headers: serviceHeaders(req) },
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// POST /api/aivion/workflow/uploads → sheru-platform-workflow /v1/uploads
router.post('/uploads', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    const { data } = await axios.post(`${WORKFLOW_URL}/v1/uploads`, form, {
      headers: { ...serviceHeaders(req), ...form.getHeaders() },
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// GET /api/aivion/workflow/runs/:runId/stream → SSE proxy (piped, long-lived)
router.get('/runs/:runId/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = req.user?.openidId || req.user?.id || 'unknown';
  try {
    const upstream = await axios.get(
      `${WORKFLOW_URL}/v1/workflow-runs/${req.params.runId}/stream`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_TOKEN}`,
          'X-User-Id': userId,
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        timeout: 0,
      },
    );
    upstream.data.pipe(res);
    req.on('close', () => upstream.data.destroy());
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'upstream error' })}\n\n`);
    res.end();
  }
});

// GET /api/aivion/workflow/connections → sheru-platform-workflow /v1/connections
router.get('/connections', async (req, res) => {
  try {
    const { data } = await axios.get(`${WORKFLOW_URL}/v1/connections`, {
      headers: serviceHeaders(req),
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// POST /api/aivion/workflow/connections/:service/initiate
router.post('/connections/:service/initiate', async (req, res) => {
  try {
    const { data } = await axios.post(
      `${WORKFLOW_URL}/v1/connections/${req.params.service}/initiate`,
      {},
      { headers: serviceHeaders(req) },
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

// POST /api/aivion/workflow/runs/:runId/chat → sheru-platform-workflow /v1/workflow-runs/:runId/chat
router.post('/runs/:runId/chat', async (req, res) => {
  try {
    const { data } = await axios.post(
      `${WORKFLOW_URL}/v1/workflow-runs/${req.params.runId}/chat`,
      req.body,
      { headers: serviceHeaders(req) },
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    const detail = err.response?.data?.detail ?? err.response?.data ?? 'upstream error';
    res.status(status).json({ error: detail });
  }
});

// POST /api/aivion/workflow/assist → aivion-router-gateway /internal/llm/collect (billed per user VK)
router.post('/assist', async (req, res) => {
  const rawGateway = process.env.AIVION_ROUTER_BASE_URL || 'http://aivion-router-gateway:8003';
  const GATEWAY_URL = rawGateway.replace(/\/v\d+\/?$/, '');
  const clerkUserId = req.user?.openidId || req.user?.id || null;

  try {
    const { messages = [], context, runId } = req.body;

    // Resolve org_slug for billing — needed by /internal/llm/collect
    let orgSlug = null;
    if (clerkUserId) {
      try {
        const { data: me } = await axios.get(
          `${BACKEND_URL}/admin/api/v1/workspace/me`,
          { headers: serviceHeaders(req) },
        );
        orgSlug = me.org_slug ?? null;
      } catch (_) { /* fall through — unbilled if org unresolvable */ }
    }

    // Build a single prompt string from the conversation
    const system = context
      ? `You are a helpful AI assistant for workflow automation. Current context:\n${context}\n\nAnswer concisely.`
      : 'You are a helpful AI assistant for workflow automation. Answer concisely.';
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    const prompt = `${system}\n\nConversation:\n${history}`;

    const payload = {
      prompt,
      product: orgSlug || 'sheru',
      team_slug: orgSlug || null,
      clerk_user_id: clerkUserId || null,
      workflow_run_id: runId || null,
    };

    const { data } = await axios.post(
      `${GATEWAY_URL}/internal/llm/collect`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    res.json({ reply: data.text ?? '' });
  } catch (err) {
    res.status(502).json({ error: err.response?.data?.detail ?? 'AI service unavailable' });
  }
});

// DELETE /api/aivion/workflow/connections/:service
router.delete('/connections/:service', async (req, res) => {
  try {
    const { data } = await axios.delete(
      `${WORKFLOW_URL}/v1/connections/${req.params.service}`,
      { headers: serviceHeaders(req) },
    );
    res.json(data);
  } catch (err) {
    const status = err.response?.status ?? 502;
    res.status(status).json({ error: err.response?.data ?? 'upstream error' });
  }
});

module.exports = router;
