/**
 * BKL BIMS 조직(그룹) 정보 연동.
 *
 * 어드민 [사용자] 메뉴가 그룹을 `class 62` 처럼 원시 코드로 표시하던 것을
 * 실제 그룹명으로 바꾸기 위한 조회 계층이다.
 *
 * 알아둘 점:
 *  - `userClass`(bkl_user_class) 와 무관한 별개 체계다. groupSid 범위가
 *    133~405 로 class 62/63/66 과 겹치지도 않는다.
 *  - base URL 이 기존 `BKL_BIMS_BASE`(/apis/case/mentat) 와 경로 체계가 달라
 *    `BIMS_ORG_BASE` 로 분리한다. 절대 공유하지 않는다.
 *  - 배치 조회가 없어 사용자 1명당 1콜이다. 그래서 결과를 user document 에
 *    저장해 영구 캐시로 쓰고, 만료됐을 때만 다시 부른다.
 *  - `BIMS_ORG_BASE` 미설정 시 전체 기능이 비활성이다 (운영 개방 전 상태).
 *
 * 환경변수:
 *   BIMS_ORG_BASE         조직 API base (예: https://nbtest.bkl.co.kr/mentat-api/api/mentat)
 *   BIMS_ORG_AUTH_HEADER  인증 헤더 이름 (운영이 인증을 요구할 경우)
 *   BIMS_ORG_AUTH_VALUE   인증 헤더 값
 *   BIMS_ORG_TIMEOUT_MS   요청 타임아웃 (기본 8000)
 *   BIMS_ORG_STALE_DAYS   재조회 주기 (기본 30일)
 */
const { logger } = require('@librechat/data-schemas');
const { persistBklFields } = require('~/server/services/bklSso');

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_STALE_DAYS = 30;

const orgBase = () => (process.env.BIMS_ORG_BASE || '').trim().replace(/\/+$/, '');

/** `BIMS_ORG_BASE` 가 설정돼 있을 때만 조직 연동이 동작한다. */
function isOrgApiEnabled() {
  return orgBase().length > 0;
}

function timeoutMs() {
  const value = Number(process.env.BIMS_ORG_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function staleMs() {
  const days = Number(process.env.BIMS_ORG_STALE_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : DEFAULT_STALE_DAYS) * 24 * 3600 * 1000;
}

function authHeaders() {
  const name = (process.env.BIMS_ORG_AUTH_HEADER || '').trim();
  const value = process.env.BIMS_ORG_AUTH_VALUE || '';
  return name && value ? { [name]: value } : {};
}

const numOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const strOrNull = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
};

/**
 * 조직 API 응답 → user document 에 저장할 필드.
 *
 * 응답은 배열 1건이 정상이지만 `{ data: [...] }` 로 감싸 오는 변형도 흡수한다.
 * 그룹을 식별할 값이 아무것도 없으면 null 을 돌려 저장을 건너뛰게 한다.
 */
function parseOrgResponse(payload) {
  const items = Array.isArray(payload) ? payload : payload?.data;
  const item = Array.isArray(items) ? items.find((row) => row && typeof row === 'object') : null;
  if (!item) {
    return null;
  }

  const groupSid = numOrNull(item.groupSid ?? item.groupId);
  const groupName = strOrNull(item.groupName);
  if (groupSid == null && groupName == null) {
    return null;
  }

  return {
    bkl_group_sid: groupSid,
    bkl_group_name: groupName,
    bkl_div_sid: numOrNull(item.divSid),
    bkl_div_name: strOrNull(item.divName),
    bkl_hq_sid: numOrNull(item.hqSid),
    bkl_hq_name: strOrNull(item.hqName),
  };
}

/**
 * `GET {base}/User/group/{sid}` 로 한 사용자의 조직 정보를 읽는다.
 *
 * 리다이렉트를 따라가지 않는다 — 운영은 미개방 상태에서 Azure AD 로그인으로
 * 307 을 돌려주는데, 따라가면 HTML 을 JSON 으로 파싱하려다 엉뚱한 오류가 난다.
 * 3xx 를 그대로 "미개방" 신호로 보고한다.
 *
 * @param {number|string} sid BIMS 사용자 sid
 * @returns {Promise<Record<string, unknown>|null>} 저장할 필드 또는 null
 */
async function fetchUserOrg(sid) {
  const base = orgBase();
  if (!base) {
    throw new Error('조직 API 미연동 (BIMS_ORG_BASE 미설정)');
  }

  const res = await fetch(`${base}/User/group/${encodeURIComponent(sid)}`, {
    headers: { Accept: 'application/json', ...authHeaders() },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs()),
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `조직 API 가 리다이렉트를 반환했습니다 (HTTP ${res.status}) — 엔드포인트 미개방 또는 인증 필요`,
    );
  }
  if (!res.ok) {
    throw new Error(`조직 API 응답 오류: HTTP ${res.status}`);
  }

  return parseOrgResponse(await res.json());
}

/**
 * 재조회가 필요한지 판단한다. sid 가 없으면 조회 자체가 불가능하다.
 * @param {Record<string, unknown>|null} user
 */
function needsOrgSync(user) {
  if (!user || !user.bkl_sid) {
    return false;
  }
  if (user.bkl_group_sid == null && user.bkl_group_name == null) {
    return true;
  }
  const syncedAt = user.bkl_org_synced_at ? new Date(user.bkl_org_synced_at).getTime() : 0;
  return !Number.isFinite(syncedAt) || syncedAt <= 0 || Date.now() - syncedAt > staleMs();
}

/**
 * `needsOrgSync` 의 Mongo 쿼리 버전 — 일괄 동기화 대상을 고른다.
 *
 * 성공 시(그룹이 비어 있어도) `bkl_org_synced_at` 을 갱신하므로 이 타임스탬프
 * 하나로 "한 번도 안 함"과 "오래됨"을 모두 판별할 수 있다. 실패한 사용자는
 * 타임스탬프가 남지 않아 다음 실행에서 자연히 다시 대상이 된다.
 */
function orgSyncFilter() {
  return {
    bkl_sid: { $type: 'number' },
    $or: [
      { bkl_org_synced_at: { $exists: false } },
      { bkl_org_synced_at: { $lt: new Date(Date.now() - staleMs()) } },
    ],
  };
}

/**
 * 조직 정보를 조회해 user document 에 저장한다.
 *
 * 조회는 됐지만 그룹이 비어 있는 경우에도 `bkl_org_synced_at` 은 갱신한다.
 * 그렇지 않으면 그룹이 없는 사용자를 매번 다시 조회하게 된다.
 *
 * @returns {Promise<boolean>} 그룹 정보를 저장했으면 true
 */
async function syncUserOrg(userId, sid) {
  const fields = await fetchUserOrg(sid);
  await persistBklFields(userId, { ...(fields || {}), bkl_org_synced_at: new Date() });
  return fields != null;
}

/**
 * 로그인 경로에서 쓰는 비차단 갱신.
 *
 * 로그인 응답을 지연시키지 않는 것이 핵심이다. 실패는 로그만 남기고 삼킨다 —
 * 조직 정보가 없다고 로그인을 막을 이유가 없다.
 *
 * @param {Record<string, unknown>|null} user
 */
function refreshUserOrgInBackground(user) {
  if (!isOrgApiEnabled() || !needsOrgSync(user)) {
    return;
  }
  setImmediate(() => {
    syncUserOrg(user._id, user.bkl_sid).catch((err) => {
      logger.warn(`[BKL Org] 조직 정보 갱신 실패 (sid=${user.bkl_sid}): ${err.message}`);
    });
  });
}

module.exports = {
  isOrgApiEnabled,
  parseOrgResponse,
  fetchUserOrg,
  needsOrgSync,
  orgSyncFilter,
  syncUserOrg,
  refreshUserOrgInBackground,
};
