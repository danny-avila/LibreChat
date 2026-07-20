const express = require('express');
const { COLLECTION: QUERY_LOGS } = require('~/server/services/bklQueryLog');
const { ago, parseDateRange, getDb, loadUsers } = require('./helpers');

const router = express.Router();

/**
 * Statistics endpoints backed by the append-only `bkl_query_logs` collection.
 * Unlike live `messages`-based counts, these are immune to chat deletion,
 * clone/fork duplication, and count enhance turns separately.
 *
 * All endpoints accept `?days=` or `?from=&to=` plus `&compare=prev` which
 * additionally returns the immediately-preceding period of equal length.
 */

async function summaryForRange(db, range) {
  const [queries, enhances, activeUsers] = await Promise.all([
    db.collection(QUERY_LOGS).countDocuments({ kind: 'query', createdAt: range }),
    db.collection(QUERY_LOGS).countDocuments({ kind: 'query_enhance', createdAt: range }),
    db.collection(QUERY_LOGS).distinct('user', { createdAt: range }),
  ]);
  return { queries, enhances, active_users: activeUsers.length };
}

router.get('/summary', async (req, res) => {
  try {
    const db = getDb();
    const { range, prevRange } = parseDateRange(req.query, 30);
    const [
      usersTotal,
      convosTotal,
      queriesTotal,
      enhancesTotal,
      dau,
      wau,
      mau,
      queriesToday,
      queries7d,
      current,
      prev,
    ] = await Promise.all([
      db.collection('users').countDocuments({}),
      db.collection('conversations').countDocuments({}),
      db.collection(QUERY_LOGS).countDocuments({ kind: 'query' }),
      db.collection(QUERY_LOGS).countDocuments({ kind: 'query_enhance' }),
      db.collection(QUERY_LOGS).distinct('user', { createdAt: { $gte: ago(1) } }),
      db.collection(QUERY_LOGS).distinct('user', { createdAt: { $gte: ago(7) } }),
      db.collection(QUERY_LOGS).distinct('user', { createdAt: { $gte: ago(30) } }),
      db.collection(QUERY_LOGS).countDocuments({ kind: 'query', createdAt: { $gte: ago(1) } }),
      db.collection(QUERY_LOGS).countDocuments({ kind: 'query', createdAt: { $gte: ago(7) } }),
      summaryForRange(db, range),
      req.query.compare === 'prev' ? summaryForRange(db, prevRange) : null,
    ]);

    res.json({
      now: new Date().toISOString(),
      users_total: usersTotal,
      conversations_total: convosTotal,
      queries_total: queriesTotal,
      enhances_total: enhancesTotal,
      dau: dau.length,
      wau: wau.length,
      mau: mau.length,
      queries_today: queriesToday,
      queries_7d: queries7d,
      range: current,
      prev_range: prev,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

async function dailyForRange(db, range) {
  return db
    .collection(QUERY_LOGS)
    .aggregate([
      { $match: { createdAt: range } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Seoul' } },
          queries: { $sum: { $cond: [{ $eq: ['$kind', 'query'] }, 1, 0] } },
          enhances: { $sum: { $cond: [{ $eq: ['$kind', 'query_enhance'] }, 1, 0] } },
          users: { $addToSet: '$user' },
        },
      },
      { $project: { _id: 0, date: '$_id', queries: 1, enhances: 1, active_users: { $size: '$users' } } },
      { $sort: { date: 1 } },
    ])
    .toArray();
}

router.get('/usage/daily', async (req, res) => {
  try {
    const db = getDb();
    const { range, prevRange } = parseDateRange(req.query, 30);
    const data = await dailyForRange(db, range);
    const prev = req.query.compare === 'prev' ? await dailyForRange(db, prevRange) : null;
    res.json({ data, prev });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/hourly', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 7);
    const data = await getDb()
      .collection(QUERY_LOGS)
      .aggregate([
        { $match: { createdAt: range } },
        { $group: { _id: { $hour: { date: '$createdAt', timezone: 'Asia/Seoul' } }, queries: { $sum: 1 } } },
        { $project: { _id: 0, hour: '$_id', queries: 1 } },
        { $sort: { hour: 1 } },
      ])
      .toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/by-user', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 30);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 500, 2000));
    const db = getDb();

    const rows = await db
      .collection(QUERY_LOGS)
      .aggregate([
        { $match: { createdAt: range } },
        {
          $group: {
            _id: '$user',
            queries: { $sum: { $cond: [{ $eq: ['$kind', 'query'] }, 1, 0] } },
            enhances: { $sum: { $cond: [{ $eq: ['$kind', 'query_enhance'] }, 1, 0] } },
            last_active: { $max: '$createdAt' },
            active_days_set: {
              $addToSet: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Seoul' },
              },
            },
            models: { $push: '$model' },
          },
        },
        {
          $project: {
            queries: 1,
            enhances: 1,
            last_active: 1,
            active_days: { $size: '$active_days_set' },
            models: 1,
          },
        },
        { $sort: { queries: -1 } },
        { $limit: limit },
      ])
      .toArray();

    const userIds = rows.map((row) => row._id).filter(Boolean);
    let convoMap = new Map();
    if (userIds.length > 0) {
      const convos = await db
        .collection('conversations')
        .aggregate([
          { $match: { user: { $in: userIds }, createdAt: range } },
          { $group: { _id: '$user', conversations: { $sum: 1 } } },
        ])
        .toArray();
      convoMap = new Map(convos.map((convo) => [String(convo._id), convo.conversations]));
    }

    const userMap = await loadUsers(db, userIds, {
      name: 1,
      username: 1,
      bkl_user_class: 1,
      bkl_user_id: 1,
      email: 1,
    });

    res.json({
      data: rows.map((row) => {
        const user = userMap.get(String(row._id)) || {};
        /** per-model breakdown for the drill-down view */
        const modelCounts = {};
        for (const model of row.models || []) {
          const key = model || '(미분류)';
          modelCounts[key] = (modelCounts[key] || 0) + 1;
        }
        return {
          user_id: String(row._id),
          name: user.name ?? null,
          username: user.username ?? null,
          bkl_user_class: user.bkl_user_class ?? null,
          bkl_user_id: user.bkl_user_id ?? null,
          email: user.email ?? null,
          queries: row.queries,
          enhances: row.enhances,
          active_days: row.active_days,
          conversations: convoMap.get(String(row._id)) ?? 0,
          last_active: row.last_active,
          by_model: Object.entries(modelCounts)
            .map(([model, queries]) => ({ model, queries }))
            .sort((a, b) => b.queries - a.queries),
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

async function byModelForRange(db, range) {
  return db
    .collection(QUERY_LOGS)
    .aggregate([
      { $match: { kind: 'query', createdAt: range } },
      { $group: { _id: '$model', queries: { $sum: 1 } } },
      { $project: { _id: 0, model: '$_id', queries: 1 } },
      { $sort: { queries: -1 } },
    ])
    .toArray();
}

router.get('/usage/by-model', async (req, res) => {
  try {
    const db = getDb();
    const { range, prevRange } = parseDateRange(req.query, 30);
    const data = await byModelForRange(db, range);
    const prev = req.query.compare === 'prev' ? await byModelForRange(db, prevRange) : null;
    res.json({ data, prev });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/by-group', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 30);
    const data = await getDb()
      .collection(QUERY_LOGS)
      .aggregate([
        { $match: { createdAt: range } },
        { $addFields: { user_oid: { $convert: { input: '$user', to: 'objectId', onError: null } } } },
        { $lookup: { from: 'users', localField: 'user_oid', foreignField: '_id', as: 'u' } },
        { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$u.bkl_user_class', 'unknown'] },
            queries: { $sum: { $cond: [{ $eq: ['$kind', 'query'] }, 1, 0] } },
            enhances: { $sum: { $cond: [{ $eq: ['$kind', 'query_enhance'] }, 1, 0] } },
            users: { $addToSet: '$user' },
          },
        },
        { $project: { _id: 0, user_class: '$_id', queries: 1, enhances: 1, active_users: { $size: '$users' } } },
        { $sort: { queries: -1 } },
      ])
      .toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/messages/recent', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 500));
    const db = getDb();
    const logs = await db
      .collection(QUERY_LOGS)
      .find({}, { projection: { messageId: 1, user: 1, textPreview: 1, kind: 1, createdAt: 1, conversationId: 1, model: 1 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const userMap = await loadUsers(
      db,
      [...new Set(logs.map((log) => log.user).filter(Boolean))],
      { name: 1, username: 1, bkl_user_class: 1 },
    );

    res.json({
      data: logs.map((log) => {
        const user = userMap.get(String(log.user)) || {};
        return {
          ...log,
          text: log.textPreview,
          user_name: user.name ?? null,
          user_username: user.username ?? null,
          user_class: user.bkl_user_class ?? null,
        };
      }),
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
