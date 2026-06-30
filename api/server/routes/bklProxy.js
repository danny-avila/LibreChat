/**
 * BKL LibreChat — bkl-api reverse proxy with BIMS user identity forwarding
 *
 * 변경 사항 (2026-05-26):
 *   기존: req.user 의 BIMS 식별자가 bkl-api 로 전혀 forward 안 됨 → ACL 적용 불가.
 *   새: req.user 에서 bkl_sid / bkl_user_id 추출 → X-BKL-User-Sid / X-BKL-User-Id
 *       header 로 forward. bkl-api 의 middleware 가 이를 UserIdentity 로 변환.
 *
 * 변경 사항 (2026-06-22):
 *   기존: ai-api 의 service token 을 안 보냄 → get_current_principal 가 401.
 *   새: 서버측 IRE_API_TOKEN 을 `Authorization: Bearer` 로 주입
 *       (src/api/dependencies/auth.py 의 _extract_bearer 가 검증).
 *       이 token 은 admin 으로 seed 되며, 위의 X-BKL-User-* header 가 함께
 *       전달되면 auth.py 가 act-as 로 강등시켜 해당 user 의 ACL 만 적용한다.
 *       token 은 절대 client 로 노출되지 않음 (forwardHeaders 는 outbound 전용).
 *
 * 컨테이너 path: /app/api/server/routes/bklProxy.js
 */
const express = require('express');
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { bklIdentityHeaders } = require('@librechat/api');

const router = express.Router();

const BKL_BASE_URL = process.env.BKL_API_BASE_URL || 'http://bkl-api:8000';

// ai-api service token. auth.py 가 `Authorization: Bearer <token>` 또는
// `X-API-Key` 로 검증하며, 이 값은 ai-api 의 IRE_API_TOKEN / IRE_ADMIN_TOKEN 과
// 동일해야 한다 (librechat.yaml 의 custom endpoint apiKey 와도 일치).
// 서버측 env 에서만 읽고 절대 client 로 forward 하지 않는다.
const BKL_API_TOKEN = process.env.IRE_API_TOKEN || '';

if (!BKL_API_TOKEN) {
  logger.warn(
    '[bklProxy] IRE_API_TOKEN is not set — /bkl/* requests will be rejected by ai-api (401). ' +
      'Set IRE_API_TOKEN on the librechat container to the same value seeded into ai-api.',
  );
}

router.use(async (req, res) => {
  const targetUrl = `${BKL_BASE_URL}${req.originalUrl.replace(/^\/bkl/, '')}`;

  // ─── BIMS user identity forward ───────────────────────────────────
  // req.user 는 passport 가 attach (jwtStrategy 또는 localStrategy 이후).
  // 비로그인 요청 (예: /bkl/health) 은 req.user 없음 → identity header 안 보냄.
  // bklIdentityHeaders() 가 X-BKL-User-Sid/-Id/-Nm, X-LC-User-* 를 일관되게
  // 생성 (sid 없으면 omit, 이름은 URL-encode). 같은 helper 가 chat completion
  // outbound (custom endpoint initialize) 에도 쓰여 주입이 한 곳에서 관리됨.
  const forwardHeaders = {
    'Content-Type': req.headers['content-type'] || 'application/json',
    Accept: req.headers['accept'] || 'application/json',
    ...bklIdentityHeaders(req),
  };

  // ─── ai-api service token (server-side only) ──────────────────────
  // 모든 /bkl proxied route 에 동일하게 주입. client 의 Authorization (LibreChat
  // JWT) 은 forward 하지 않으므로 덮어쓸 위험 없음.
  if (BKL_API_TOKEN) {
    forwardHeaders['Authorization'] = `Bearer ${BKL_API_TOKEN}`;
  }

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req.body,
      headers: forwardHeaders,
      timeout: 60_000,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    });

    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    res.status(response.status).send(response.data);
  } catch (err) {
    logger.error('[bklProxy] Failed to reach BKL API:', err?.message || err);
    res.status(502).json({
      error: 'BKL API upstream error',
      detail: err?.message || String(err),
    });
  }
});

module.exports = router;
