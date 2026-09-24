const express = require('express');
const { parseDateRange, getDb, loadConversationMessages } = require('./helpers');
const { isOrgApiEnabled, orgSyncFilter, syncUserOrg } = require('~/server/services/bklOrg');

const router = express.Router();

router.get('/users', async (_req, res) => {
  try {
    const users = await getDb()
      .collection('users')
      .find(
        {},
        {
          projection: {
            name: 1,
            username: 1,
            email: 1,
            role: 1,
            bkl_sid: 1,
            bkl_user_class: 1,
            bkl_user_id: 1,
            bkl_user_nm: 1,
            bkl_department: 1,
            bkl_group_sid: 1,
            bkl_group_name: 1,
            bkl_div_name: 1,
            bkl_hq_name: 1,
            createdAt: 1,
            bkl_last_login_at: 1,
          },
        },
      )
      .toArray();
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/sessions/by-user', async (req, res) => {
  try {
    const { user_id: userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'user_id required' });
    }

    const { range } = parseDateRange(req.query, 365);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const includeDeleted = req.query.include_deleted === '1';
    const db = getDb();

    const filter = { user: userId, createdAt: range };
    if (!includeDeleted) {
      filter.bklDeletedAt = { $exists: false };
    }
    const convos = await db
      .collection('conversations')
      .find(filter, {
        projection: { conversationId: 1, title: 1, createdAt: 1, updatedAt: 1, bklDeletedAt: 1 },
      })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    if (!convos.length) {
      return res.json({ data: [] });
    }

    const convoIds = convos.map((convo) => convo.conversationId).filter(Boolean);
    const msgStats = await db
      .collection('messages')
      .aggregate([
        { $match: { conversationId: { $in: convoIds } } },
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: '$conversationId',
            msg_count: { $sum: 1 },
            first_query: { $first: { $cond: [{ $eq: ['$isCreatedByUser', true] }, '$text', null] } },
            started_at: { $min: '$createdAt' },
            last_at: { $max: '$createdAt' },
          },
        },
      ])
      .toArray();
    const statsMap = new Map(msgStats.map((stat) => [stat._id, stat]));

    res.json({
      data: convos.map((convo) => {
        const stats = statsMap.get(convo.conversationId) || {};
        return {
          conversation_id: convo.conversationId,
          title: convo.title || '(untitled)',
          started_at: stats.started_at || convo.createdAt,
          last_at: stats.last_at || convo.updatedAt,
          msg_count: stats.msg_count || 0,
          first_query: (stats.first_query || '').slice(0, 120),
          deleted_at: convo.bklDeletedAt ?? null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/sessions/messages', async (req, res) => {
  try {
    const { conversation_id: conversationId } = req.query;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversation_id required' });
    }

    res.json({ data: await loadConversationMessages(getDb(), conversationId) });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/**
 * 그룹 인사이트 (항목 3): 그룹별 시간대 패턴 + 최근 질의 키워드 상위.
 * 문서/케이스 Top은 Postgres 기반 FastAPI analytics 프록시(/analytics/*)에서 제공.
 */
router.get('/groups/insights', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 30);
    // BKL: 그룹 식별자는 BIMS 조직의 groupSid 다 (과거 user_class 는 조직 체계가 아니었다).
    const groupSid = req.query.group_sid;
    const scoped = groupSid != null && groupSid !== '' && groupSid !== 'all';
    const db = getDb();

    const matchUsers = scoped
      ? { bkl_group_sid: Number.isNaN(Number(groupSid)) ? groupSid : Number(groupSid) }
      : {};
    const users = await db
      .collection('users')
      .find(matchUsers, { projection: { _id: 1, bkl_group_sid: 1 } })
      .toArray();
    const userIds = users.map((u) => String(u._id));

    const logMatch = { createdAt: range };
    if (scoped) {
      logMatch.user = { $in: userIds };
    }

    const [hourly, previews] = await Promise.all([
      db
        .collection('bkl_query_logs')
        .aggregate([
          { $match: logMatch },
          { $group: { _id: { $hour: { date: '$createdAt', timezone: 'Asia/Seoul' } }, queries: { $sum: 1 } } },
          { $project: { _id: 0, hour: '$_id', queries: 1 } },
          { $sort: { hour: 1 } },
        ])
        .toArray(),
      db
        .collection('bkl_query_logs')
        .find(logMatch, { projection: { textPreview: 1 } })
        .sort({ createdAt: -1 })
        .limit(2000)
        .toArray(),
    ]);

    /** naive keyword extraction: whitespace tokens >= 2 chars, stopword-light */
    const counts = new Map();
    for (const { textPreview } of previews) {
      const tokens = String(textPreview || '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2 && t.length <= 20);
      for (const token of new Set(tokens)) {
        counts.set(token, (counts.get(token) || 0) + 1);
      }
    }
    const topKeywords = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([keyword, count]) => ({ keyword, count }));

    res.json({ hourly, top_keywords: topKeywords, sample_size: previews.length });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/**
 * 부서 API 응답 → [{ user_id, department }] 매핑.
 * 실제 부서 API 스펙은 아직 미수령 — 스펙 확정 시 이 함수만 수정하면 된다.
 * 현재는 흔한 형태를 방어적으로 지원: 배열 또는 { data: [...] } 안의
 * { userId|user_id|id, deptNm|dept|department|deptName } 항목.
 */
function parseDepartmentApiResponse(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const mappings = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const userId = item.userId ?? item.user_id ?? item.id;
    const department = [item.deptNm, item.dept, item.department, item.deptName]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find((v) => v.length > 0);
    if (userId != null && department) {
      mappings.push({ user_id: String(userId), department });
    }
  }
  return mappings;
}

/**
 * 부서 동기화 훅 — env `BKL_DEPT_API_URL` 이 설정돼 있으면 부서 API 를 호출해
 * 사번(bkl_user_id) → 부서 매핑을 users.bkl_department 에 일괄 반영한다.
 * 미설정 시 안내만 반환한다 (API 수령 전 선구축 상태).
 */
router.post('/users/sync-departments', async (_req, res) => {
  try {
    const apiUrl = process.env.BKL_DEPT_API_URL;
    if (!apiUrl) {
      return res.json({
        synced: 0,
        message: '부서 API 미연동 (BKL_DEPT_API_URL 미설정). API 수령 후 환경변수를 설정하세요.',
      });
    }

    const response = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return res.status(502).json({ error: `부서 API 응답 오류: HTTP ${response.status}` });
    }
    const mappings = parseDepartmentApiResponse(await response.json());
    if (!mappings.length) {
      return res.json({ synced: 0, message: '부서 API 응답에서 매핑을 찾지 못했습니다.' });
    }

    const db = getDb();
    const result = await db.collection('users').bulkWrite(
      mappings.map(({ user_id: userId, department }) => ({
        updateMany: {
          filter: { bkl_user_id: userId },
          update: { $set: { bkl_department: department } },
        },
      })),
      { ordered: false },
    );
    res.json({ synced: result.modifiedCount, mappings: mappings.length });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/** 조직 API 는 배치 조회가 없어 사용자당 1콜이다 — BIMS 부하를 억제한다. */
const ORG_SYNC_CONCURRENCY = 5;

/**
 * 그룹(조직) 일괄 동기화 — 아직 조직 정보가 없거나 오래된 사용자를 채운다.
 *
 * 로그인 시점에도 비차단으로 채우므로(`bklOrg.refreshUserOrgInBackground`)
 * 이 엔드포인트는 "아직 로그인하지 않은 사용자" 정리용이다.
 *
 * 사용자당 1콜이라 전체를 한 번에 돌리면 요청이 길어져 프록시 타임아웃에
 * 걸린다. `limit` 단위로 끊고 `remaining` 을 돌려주어 운영자가 다시 눌러
 * 이어서 진행할 수 있게 한다.
 */
router.post('/users/sync-groups', async (req, res) => {
  try {
    if (!isOrgApiEnabled()) {
      return res.json({
        synced: 0,
        message:
          '조직 API 미연동 (BIMS_ORG_BASE 미설정). BIMS 운영 개방 후 환경변수를 설정하세요.',
      });
    }

    const limit = Math.max(1, Math.min(parseInt(req.body?.limit, 10) || 200, 1000));
    const users = getDb().collection('users');
    const targets = await users
      .find(orgSyncFilter(), { projection: { _id: 1, bkl_sid: 1 } })
      .limit(limit)
      .toArray();

    if (!targets.length) {
      return res.json({
        synced: 0,
        empty: 0,
        failed: 0,
        remaining: 0,
        message: '동기화할 사용자가 없습니다.',
      });
    }

    let synced = 0;
    let empty = 0;
    let failed = 0;
    const errors = [];

    const queue = [...targets];
    const runWorker = async () => {
      for (let user = queue.shift(); user; user = queue.shift()) {
        try {
          if (await syncUserOrg(user._id, user.bkl_sid)) {
            synced += 1;
          } else {
            empty += 1;
          }
        } catch (err) {
          failed += 1;
          if (errors.length < 5) {
            errors.push(`sid=${user.bkl_sid}: ${err.message}`);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: ORG_SYNC_CONCURRENCY }, runWorker));

    // 실패한 사용자는 타임스탬프가 남지 않아 여기 다시 포함된다. remaining 이
    // 줄지 않으면 failed/errors 를 보고 원인을 판단하면 된다.
    const remaining = await users.countDocuments(orgSyncFilter());

    res.json({ synced, empty, failed, remaining, processed: targets.length, errors });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
