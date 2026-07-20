const express = require('express');
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { requireAdminToken } = require('./middleware');
const { getDb } = require('./helpers');

const router = express.Router();

/* health 는 인증 없이 (컨테이너 프로브용) */
router.get('/health', async (_req, res) => {
  try {
    res.json({ status: 'ok', mongo: await getDb().command({ ping: 1 }) });
  } catch (err) {
    res.status(500).json({ status: 'error', detail: String(err.message) });
  }
});

/* 토큰 검증용 (UI 최초 진입 시 사용) */
router.get('/auth/check', requireAdminToken, (_req, res) => {
  res.json({ ok: true });
});

router.use(requireAdminToken);

router.use(require('./stats'));
router.use(require('./sessions'));
router.use(require('./deleted'));
router.use(require('./shares'));
router.use(require('./notices'));
router.use(require('./surveys'));
router.use(require('./settings'));

/**
 * FastAPI analytics 프록시: /admin-api/analytics/* → ai-api /analytics/*
 * (Top 문서/케이스, 질문 유형, 그룹 인사이트, AI 통계 요약 — Postgres 기반).
 * nginx 설정 변경 없이 어드민 토큰 검사 후 서버측 IRE 토큰으로 위임한다.
 */
router.use('/analytics', async (req, res) => {
  const baseUrl = process.env.BKL_API_BASE_URL || 'http://bkl-api:8000';
  const targetUrl = `${baseUrl}/analytics${req.url}`;
  const headers = { Accept: 'application/json' };
  if (process.env.IRE_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.IRE_API_TOKEN}`;
  }
  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req.body,
      headers: req.method === 'GET' ? headers : { ...headers, 'Content-Type': 'application/json' },
      timeout: 120_000,
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    logger.error('[bklAdmin/analytics] upstream error', err?.message || err);
    res.status(502).json({ error: 'analytics upstream error', detail: String(err?.message || err) });
  }
});

router.use((err, _req, res, _next) => {
  logger.error('[bkl-admin-api] request failed', err);
  res.status(500).json({ error: String(err.message || err) });
});

module.exports = router;
