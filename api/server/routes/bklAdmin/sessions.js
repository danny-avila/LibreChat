const express = require('express');
const { parseDateRange, getDb, loadUsers } = require('./helpers');

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

    const msgs = await getDb()
      .collection('messages')
      .find(
        { conversationId },
        { projection: { isCreatedByUser: 1, text: 1, content: 1, createdAt: 1, model: 1, sender: 1 } },
      )
      .sort({ createdAt: 1 })
      .toArray();

    res.json({
      data: msgs.map((msg) => {
        let text = msg.text || '';
        if (!text && Array.isArray(msg.content)) {
          text = msg.content
            .filter((content) => content && content.type === 'text')
            .map((content) => content.text || '')
            .join('\n')
            .trim();
        }
        return {
          role: msg.isCreatedByUser ? 'user' : 'assistant',
          text,
          createdAt: msg.createdAt,
          model: msg.model || null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/**
 * 그룹 인사이트 (항목 3): 그룹(class)별 시간대 패턴 + 최근 질의 키워드 상위.
 * 문서/케이스 Top은 Postgres 기반 FastAPI analytics 프록시(/analytics/*)에서 제공.
 */
router.get('/groups/insights', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 30);
    const userClass = req.query.user_class;
    const db = getDb();

    const matchUsers = {};
    if (userClass != null && userClass !== '' && userClass !== 'all') {
      matchUsers.bkl_user_class = Number.isNaN(Number(userClass)) ? userClass : Number(userClass);
    }
    const users = await db
      .collection('users')
      .find(matchUsers, { projection: { _id: 1, bkl_user_class: 1 } })
      .toArray();
    const userIds = users.map((u) => String(u._id));

    const logMatch = { createdAt: range };
    if (userClass != null && userClass !== '' && userClass !== 'all') {
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

module.exports = router;
