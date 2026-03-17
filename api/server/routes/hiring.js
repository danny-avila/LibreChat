const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const Candidate = require('~/models/Candidate');
const HiringTask = require('~/models/HiringTask');
const onboardingAgent = require('../services/OnboardingAgent');
const logger = require('~/config/winston');

// ── WhatsApp Webhook ──────────────────────────────────────────────────────────

/**
 * GET /api/hiring/whatsapp/webhook
 * Meta webhook verification handshake.
 */
router.get('/whatsapp/webhook', (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info(`[WhatsApp] Webhook hit — mode=${mode} token=${token} envToken=${verifyToken}`);

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('[WhatsApp] Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Forbidden', debug: { mode, token, envToken: verifyToken } });
});

/**
 * POST /api/hiring/whatsapp/webhook
 * Receive incoming WhatsApp messages and route to OnboardingAgent.
 */
router.post('/whatsapp/webhook', async (req, res) => {
  // Acknowledge immediately — Meta requires a 200 within 20s
  res.status(200).send('OK');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value || !value.messages) continue;

        for (const message of value.messages) {
          if (message.type !== 'text') continue;

          const from = `+${message.from}`; // Meta sends without leading +
          const text = message.text?.body?.trim();
          if (!text) continue;

          // Find candidate by WhatsApp number
          const candidate = await Candidate.findOne({ whatsapp: from, status: 'onboarding' });
          if (!candidate) {
            logger.warn(`[WhatsApp] Received message from unknown/inactive number: ${from}`);
            continue;
          }

          const field = ['fullLegalName', 'dateOfBirth', 'address', 'emergencyContact', 'roleStartDate'][candidate.onboardingStep];
          if (!field) continue;

          logger.info(`[WhatsApp] Processing response from ${from} for field: ${field}`);
          await onboardingAgent.processResponse(candidate._id.toString(), field, text);
        }
      }
    }
  } catch (err) {
    logger.error('[WhatsApp] Webhook processing error:', err.message);
  }
});

// ── Candidates ────────────────────────────────────────────────────────────────

/**
 * POST /api/hiring/candidates
 * Create a candidate and trigger the OnboardingAgent.
 */
router.post('/candidates', requireJwtAuth, async (req, res) => {
  const { name, whatsapp, role } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!whatsapp || !whatsapp.trim()) {
    return res.status(400).json({ error: 'whatsapp is required' });
  }

  try {
    const candidate = await Candidate.create({ name: name.trim(), whatsapp: whatsapp.trim(), role: role?.trim() ?? '' });
    // Fire-and-forget — errors are handled inside the agent
    onboardingAgent.initiateConversation(candidate).catch((err) =>
      logger.error('[hiring] OnboardingAgent error:', err.message),
    );
    return res.status(201).json(candidate);
  } catch (err) {
    logger.error('[hiring] POST /candidates error:', err.message);
    return res.status(500).json({ error: 'Failed to create candidate' });
  }
});

/**
 * GET /api/hiring/candidates
 * Return all candidates.
 */
router.get('/candidates', requireJwtAuth, async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    return res.json(candidates);
  } catch (err) {
    logger.error('[hiring] GET /candidates error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

/**
 * GET /api/hiring/candidates/:id
 * Return a single candidate by ID.
 */
router.get('/candidates/:id', requireJwtAuth, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    return res.json(candidate);
  } catch (err) {
    logger.error('[hiring] GET /candidates/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch candidate' });
  }
});

/**
 * PATCH /api/hiring/candidates/:id
 * Partial update of a candidate.
 */
router.patch('/candidates/:id', requireJwtAuth, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    return res.json(candidate);
  } catch (err) {
    logger.error('[hiring] PATCH /candidates/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/hiring/tasks
 * Create a hiring task.
 */
router.post('/tasks', requireJwtAuth, async (req, res) => {
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  try {
    const task = await HiringTask.create({ title: title.trim(), description: description?.trim() ?? '' });
    return res.status(201).json(task);
  } catch (err) {
    logger.error('[hiring] POST /tasks error:', err.message);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * GET /api/hiring/tasks
 * Return all tasks.
 */
router.get('/tasks', requireJwtAuth, async (req, res) => {
  try {
    const tasks = await HiringTask.find().sort({ createdAt: -1 });
    return res.json(tasks);
  } catch (err) {
    logger.error('[hiring] GET /tasks error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * PATCH /api/hiring/tasks/:id
 * Update a task's status or title.
 */
router.patch('/tasks/:id', requireJwtAuth, async (req, res) => {
  try {
    const task = await HiringTask.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    return res.json(task);
  } catch (err) {
    logger.error('[hiring] PATCH /tasks/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

module.exports = router;
