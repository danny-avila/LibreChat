/**
 * BKL SSO — Azure OIDC 인증 후 BIMS 신원(sid) 연결
 *
 * 배경
 * ----
 * 비밀번호 로그인(api/strategies/localStrategy.js)은 BIMS 로그인 API 응답에서
 * sid 를 받아 user 문서에 bkl_* 필드로 저장하고, bklIdentityHeaders() 가 그
 * 값을 `X-BKL-User-Sid` 헤더로 ai-api 에 실어 보내 사건별 ACL 을 태운다.
 *
 * 인증 주체가 Azure OIDC 로 바뀌어도 그 구조는 그대로 쓴다. OIDC 는 AD ID 만
 * 알려줄 뿐 BIMS sid 를 모르므로, 인증 성공 직후 이 모듈이 BIMS 로그인 API 를
 * 비밀번호 없이 호출해 sid 를 받아온다.
 *
 *     POST /apis/identity/auth/login   { id, password: "", isPC: true }
 *
 * BIMS 케이스 API 와 iManage 프록시는 모두 무인증 호출이므로(BIMS API 명세서
 * v1.3 §1, §3) 응답의 accessToken / refreshToken 은 저장하지 않는다. 필요한
 * 것은 sid 뿐이고, 토큰 갱신(§2-7)도 우리 경로에서는 필요 없다.
 *
 * AD ID 폴백 체인
 * ---------------
 * BIMS userId 포맷이 계정마다 다르다 — 명세서 §2-5 응답 예시만 봐도 "HRC",
 * "JMA", "soohyun.kim" 이 섞여 있다. UPN 로컬파트가 곧 BIMS userId 라는
 * 보장이 없어서 로컬파트 → 전체 UPN 순으로 시도하고, 성공한 값을
 * `bkl_login_id` 에 캐시해 다음 로그인부터는 한 번에 맞춘다.
 *
 * UPN 자체는 `upn` 클레임에서 읽는다 (bklIdCandidates 주석 참고).
 *
 * 실패 정책
 * ---------
 *   BIMS 200 + sid          → 정상 연결
 *   전부 실패 + 기존 sid 有 → 기존 값으로 진행 (BIMS 장애 시 로그인 유지)
 *   전부 실패 + 첫 로그인   → 로그인 거부 (ACL 키가 없으면 검색 결과가 0건이라
 *                             "로그인은 됐는데 아무것도 안 나온다" 가 된다)
 */
const { logger } = require('@librechat/data-schemas');
const mongoose = require('mongoose');

const BKL_AUTH_URL =
  process.env.BKL_AUTH_URL || 'https://nb.bkl.co.kr/apis/identity/auth/login';
const BKL_EMAIL_SUFFIX = process.env.BKL_EMAIL_SUFFIX || '@bkl.co.kr';
const BKL_SSO_TIMEOUT_MS = Number(process.env.BKL_SSO_TIMEOUT_MS) || 10000;

/**
 * Persist BIMS fields directly via mongoose, bypassing Mongoose strict mode.
 *
 * LibreChat 의 user schema 에는 bkl_* 필드가 정의돼 있지 않다. updateUser() 는
 * findByIdAndUpdate({runValidators:true}) 를 쓰는데 strict mode 가 기본이라
 * schema 에 없는 필드는 silently drop 된다. 그래서 mongoose Model 을 직접
 * 호출하고 strict:false 를 준다.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Record<string, unknown>} bklFields  { bkl_sid, bkl_user_id, ... }
 */
async function persistBklFields(userId, bklFields) {
  const User = mongoose.models.User;
  if (!User) {
    logger.error('[BKL SSO] mongoose.models.User not available');
    return null;
  }
  return await User.findByIdAndUpdate(
    userId,
    { $set: bklFields },
    { strict: false, new: true },
  ).lean();
}

/**
 * schema 밖 필드(bkl_*)까지 읽어야 하므로 select 없이 lean 으로 통째 조회한다.
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function readUserDoc(userId) {
  const User = mongoose.models.User;
  if (!User || !userId) {
    return null;
  }
  try {
    return await User.findById(userId).lean();
  } catch (err) {
    logger.warn(`[BKL SSO] user 조회 실패: ${err.message}`);
    return null;
  }
}

/**
 * OIDC 클레임에서 BIMS 로그인 id 후보를 우선순위대로 만든다.
 *
 * UPN 은 `upn` 클레임에서 읽는다. `preferred_username` 은 OIDC 명세상
 * "표시용이며 고유하지도 불변하지도 않다"고 못박힌 값이라 계정 식별에 쓸
 * 물건이 아니다 — Azure 도 로그인 이름 변경 / 대체 로그인 ID 설정에 따라
 * `upn` 과 다른 값을 실어 보낸다. `upn` 은 Azure v2.0 토큰에서 선택적
 * 클레임이므로, 없으면 기존 순서(preferred_username → email)로 내려간다.
 *
 * @param {Record<string, unknown>} claims  id_token 클레임
 * @param {string|null} [cachedLoginId]     지난 로그인에서 성공한 id
 * @returns {string[]} 중복 제거된 후보 목록
 */
function bklIdCandidates(claims, cachedLoginId) {
  const upn = String(
    claims?.upn || claims?.preferred_username || claims?.email || '',
  ).trim();
  const candidates = [];

  if (cachedLoginId) {
    candidates.push(String(cachedLoginId));
  }
  if (upn) {
    const suffix = BKL_EMAIL_SUFFIX.toLowerCase();
    candidates.push(
      upn.toLowerCase().endsWith(suffix) ? upn.slice(0, -suffix.length) : upn,
    );
    candidates.push(upn);
  }

  return [...new Set(candidates.filter(Boolean))];
}

/**
 * BIMS 로그인 API 를 비밀번호 없이 호출한다.
 *
 * 성공 판정은 accessToken 이 아니라 **sid** 기준이다. 우리가 실제로 쓰는 값이
 * sid 이고, 응답에 errorCode / message 필드가 따로 있어서 그쪽이 더 정확하다.
 *
 * @param {string} id
 */
async function bklLogin(id) {
  try {
    const response = await fetch(BKL_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ id, password: '', isPC: true }),
      signal: AbortSignal.timeout(BKL_SSO_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.errorCode || !data.sid) {
      return {
        ok: false,
        reason: data.errorCode || data.message || `http_${response.status}`,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
}

/** BIMS 로그인 응답 → user 문서에 저장할 bkl_* 필드로 정규화 */
function toBklFields(data, loginId) {
  return {
    bkl_sid: typeof data.sid === 'number' ? data.sid : Number(data.sid) || null,
    bkl_user_id: data.userId || loginId,
    bkl_user_nm: data.userNm || loginId,
    bkl_user_class: typeof data.userClass === 'number' ? data.userClass : null,
    bkl_roles: Array.isArray(data.roles) ? data.roles : [],
    bkl_login_id: loginId,
    bkl_last_login_at: new Date(),
  };
}

/**
 * OIDC 인증 성공 직후 호출. BIMS 신원을 조회해 user 문서에 반영한다.
 *
 * `user` 객체를 in-place 로 갱신하므로 같은 요청 안에서 bkl_* 를 참조하는
 * 코드(bklIdentityHeaders 등)도 바로 최신값을 본다.
 *
 * @param {Record<string, unknown>} tokenset  openid-client tokenset
 * @param {Record<string, unknown>} user      processOpenIDAuth 결과
 * @returns {Promise<{ok: boolean, sid?: number|null, message?: string}>}
 */
const LOG_VALUE_MAX = 48;

/**
 * 클레임을 로그용으로 압축한다.
 *
 * **키는 하나도 거르지 않는다.** 어느 키에 UPN 성 값이 실려 오는지가 바로
 * 우리가 모르는 것이라, 미리 고른 키만 찍으면 그 고름이 틀렸을 때 전부 '-' 로
 * 보일 뿐 실마리가 남지 않는다. 대신 Azure 내부용 불투명 blob(`aio`, `rh` 등)이
 * 길어서 줄을 덮으므로 긴 값만 잘라낸다 — 키 이름과 길이는 그대로 보인다.
 */
function claimsForLog(claims) {
  if (!claims || typeof claims !== 'object') {
    return claims;
  }
  const out = {};
  for (const [key, value] of Object.entries(claims)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    out[key] =
      typeof text === 'string' && text.length > LOG_VALUE_MAX
        ? `${text.slice(0, 12)}…(${text.length})`
        : value;
  }
  return out;
}

/**
 * tokenset 에 어떤 토큰이 실려 왔는지만 남긴다.
 *
 * 원문을 찍지 않는 이유: access_token / id_token / refresh_token 이 그대로
 * 들어 있어 로그 열람자가 해당 사용자의 토큰을 계속 재발급할 수 있게 되고,
 * 로그는 수집기로 흘러가 회수가 어렵다. 디버깅에 필요한 내용물은 이미 위의
 * 클레임으로 다 나온다.
 */
function presentTokenNames(tokenset) {
  const names = ['id_token', 'access_token', 'refresh_token'].filter((key) => tokenset?.[key]);
  return names.length ? names.join(',') : 'none';
}

async function linkBimsIdentity(tokenset, user) {
  const claims = tokenset?.claims ? tokenset.claims() : tokenset;
  const userId = user?._id;

  if (!userId) {
    logger.error('[BKL SSO] user._id 없음 — BIMS 연결 생략');
    return { ok: false, message: 'BIMS 계정 연동에 실패했습니다.' };
  }

  const existing = await readUserDoc(userId);
  const candidates = bklIdCandidates(claims, existing?.bkl_login_id);

  // 클레임 원문과 거기서 나온 후보를 남긴다. `upn` 은 Azure v2.0 의 선택적
  // 클레임이라 앱 등록 설정에 따라 통째로 빠질 수 있고, 그러면 조용히
  // preferred_username 으로 내려간다 — 로그가 없으면 "왜 이 id 로 붙었지?" 를
  // 추적할 길이 없다.
  logger.info(
    `[BKL SSO] id_token claims ${JSON.stringify(claimsForLog(claims))} ` +
      `[tokens: ${presentTokenNames(tokenset)}]`,
  );
  logger.info(
    `[BKL SSO] 후보 산출 [cached: ${existing?.bkl_login_id ?? '-'}] ` +
      `→ ${candidates.join(' → ') || '(없음)'}`,
  );

  if (!candidates.length) {
    logger.error(
      '[BKL SSO] AD ID 를 만들 클레임이 없음 (upn / preferred_username / email 모두 비어 있음)',
    );
    return { ok: false, message: 'BIMS 계정 연동에 실패했습니다.' };
  }

  const attempts = [];
  for (const id of candidates) {
    const result = await bklLogin(id);
    if (result.ok) {
      const fields = toBklFields(result.data, id);
      await persistBklFields(userId, fields);
      Object.assign(user, fields);

      logger.info(
        `[BKL SSO] BIMS 연결 성공 [id: ${id}] [sid: ${fields.bkl_sid}] ` +
          `[userNm: ${fields.bkl_user_nm}]${attempts.length ? ` (시도: ${attempts.length + 1})` : ''}`,
      );
      return { ok: true, sid: fields.bkl_sid };
    }
    attempts.push(`${id}=${result.reason}`);
  }

  // 전부 실패 — 기존에 연결된 sid 가 있으면 그 값으로 계속 간다.
  // BIMS 장애가 전사 로그인 불가로 번지지 않게 하기 위한 폴백.
  if (existing?.bkl_sid) {
    logger.warn(
      `[BKL SSO] BIMS 조회 실패, 기존 sid 로 진행 [sid: ${existing.bkl_sid}] ` +
        `(시도: ${attempts.join(', ')})`,
    );
    await persistBklFields(userId, { bkl_last_login_at: new Date() });
    return { ok: true, sid: existing.bkl_sid };
  }

  logger.error(`[BKL SSO] BIMS 계정을 찾지 못함 (시도: ${attempts.join(', ')})`);
  return {
    ok: false,
    message: 'BIMS 계정을 찾을 수 없습니다. 관리자에게 문의해 주세요.',
  };
}

module.exports = {
  persistBklFields,
  bklIdCandidates,
  bklLogin,
  linkBimsIdentity,
};
