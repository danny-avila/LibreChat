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
  // 비로그인 요청 (예: /bkl/health) 은 req.user 없음 → header 안 보냄.
  const forwardHeaders = {
    'Content-Type': req.headers['content-type'] || 'application/json',
    Accept: req.headers['accept'] || 'application/json',
  };

  // ─── ai-api service token (server-side only) ──────────────────────
  // 모든 /bkl proxied route 에 동일하게 주입. client 의 Authorization (LibreChat
  // JWT) 은 forward 하지 않으므로 덮어쓸 위험 없음.
  if (BKL_API_TOKEN) {
    forwardHeaders['Authorization'] = `Bearer ${BKL_API_TOKEN}`;
  }

  if (req.user) {
    // bkl_sid / bkl_user_id 가 있으면 ACL 매칭에 쓸 수 있음
    if (req.user.bkl_sid != null) {
      forwardHeaders['X-BKL-User-Sid'] = String(req.user.bkl_sid);
    }

    // Fallback for migrated users: 신 image 배포 전에 로그인한 user 는
    // bkl_user_id 가 아직 저장 안 됨 (JWT 만료 전까지 patched localStrategy 가 안 돌아감).
    // 그 사이에 RAG query 가 들어오면 ACL 가 비공개 사건 모두 drop 함.
    // → username 을 fallback 으로 forward. BIMS userId 패턴이 lowercase.dot 또는
    //   UPPERCASE 약자라 LibreChat username (= BIMS userId 그대로 저장됨) 과
    //   일치하는 경우가 대부분 (대소문자는 ACLFilter 가 정규화).
    // 재로그인 시 patched localStrategy 가 정상 bkl_user_id 저장 → 이후 정확.
    const effectiveBklUserId = req.user.bkl_user_id || req.user.username || null;
    if (effectiveBklUserId) {
      forwardHeaders['X-BKL-User-Id'] = String(effectiveBklUserId);
    }

    if (req.user.bkl_user_nm) {
      // 디버그/로깅용. ACL 매칭에는 안 씀 (한글, 동명이인).
      // encodeURIComponent — HTTP header 에 non-ASCII 안전하게.
      forwardHeaders['X-BKL-User-Nm'] = encodeURIComponent(req.user.bkl_user_nm);
    } else if (req.user.name) {
      // fallback — name 도 한글일 수 있음
      forwardHeaders['X-BKL-User-Nm'] = encodeURIComponent(req.user.name);
    }
    if (req.user._id) {
      // LibreChat MongoDB _id — 추적용
      forwardHeaders['X-LC-User-Id'] = String(req.user._id);
    }
    if (req.user.email) {
      forwardHeaders['X-LC-User-Email'] = String(req.user.email);
    }
    if (req.user.role) {
      // ADMIN 인 경우 bkl-api 측에서 ACL bypass 가능
      forwardHeaders['X-LC-User-Role'] = String(req.user.role);
    }
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
