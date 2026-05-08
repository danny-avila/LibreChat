const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);

const interactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, default: null },
    promptLength: { type: Number, required: true, min: 0 },
    responseLength: { type: Number, required: true, min: 0 },
    latencyMs: { type: Number, required: true, min: 0 },
    provider: { type: String, enum: ['mock'], required: true },
    status: { type: String, enum: ['success', 'error'], required: true },
  },
  { timestamps: true },
);

interactionSchema.index({ userId: 1, createdAt: -1 });
const Interaction = mongoose.models.Interaction || mongoose.model('Interaction', interactionSchema);

const parseDate = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

router.post('/mock', async (req, res) => {
  try {
    const { prompt = '', conversationId } = req.body ?? {};

    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const start = Date.now();
    const delayMs = 200 + Math.floor(Math.random() * 600);

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const answer = `Mock response: ${prompt.slice(0, 160)}`;
    const latencyMs = Date.now() - start;

    await Interaction.create({
      userId: req.user.id,
      conversationId: typeof conversationId === 'string' ? conversationId : undefined,
      promptLength: prompt.length,
      responseLength: answer.length,
      latencyMs,
      provider: 'mock',
      status: 'success',
    });

    return res.status(200).json({
      answer,
      latencyMs,
    });
  } catch (error) {
    logger.error('[analytics][POST /mock] failed', error);
    return res.status(500).json({ error: 'Failed to process mock interaction' });
  }
});

router.get('/interactions', async (req, res) => {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const filter = {
      userId: req.user.id,
    };

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = from;
      }
      if (to) {
        filter.createdAt.$lte = to;
      }
    }

    const rows = await Interaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const total = rows.length;
    const successCount = rows.reduce((acc, row) => acc + (row.status === 'success' ? 1 : 0), 0);
    const latencySum = rows.reduce((acc, row) => acc + (row.latencyMs || 0), 0);

    const byDateMap = new Map();
    for (const row of rows) {
      const date = new Date(row.createdAt).toISOString().slice(0, 10);
      byDateMap.set(date, (byDateMap.get(date) ?? 0) + 1);
    }

    const series = Array.from(byDateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const recent = rows.slice(0, 20).map((row) => ({
      conversationId: row.conversationId ?? null,
      promptLength: row.promptLength,
      responseLength: row.responseLength,
      latencyMs: row.latencyMs,
      provider: row.provider,
      status: row.status,
      createdAt: row.createdAt,
    }));

    return res.status(200).json({
      summary: {
        total,
        successRate: total > 0 ? Number(((successCount / total) * 100).toFixed(2)) : 0,
        avgLatencyMs: total > 0 ? Math.round(latencySum / total) : 0,
      },
      series,
      recent,
    });
  } catch (error) {
    logger.error('[analytics][GET /interactions] failed', error);
    return res.status(500).json({ error: 'Failed to get interaction analytics' });
  }
});

module.exports = router;