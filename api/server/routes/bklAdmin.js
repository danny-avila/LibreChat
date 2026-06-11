const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

const ago = (days) => new Date(Date.now() - days * 24 * 3600 * 1000);

function parseDateRange(query, defaultDays = 30) {
  const { from, to, days } = query;
  if (from) {
    return {
      $gte: new Date(`${from}T00:00:00+09:00`),
      $lte: to ? new Date(`${to}T23:59:59+09:00`) : new Date(),
    };
  }
  return { $gte: ago(Math.max(1, Math.min(parseInt(days, 10) || defaultDays, 365))) };
}

function getDb() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    throw new Error(`MongoDB not connected (readyState=${conn && conn.readyState})`);
  }
  return conn.db;
}

async function loadUsers(db, userIds, projection) {
  const userOids = [];
  for (const userId of userIds) {
    try {
      userOids.push(new mongoose.Types.ObjectId(userId));
    } catch {
      // Skip non-ObjectId values.
    }
  }

  if (!userOids.length) {
    return new Map();
  }

  const users = await db.collection('users').find({ _id: { $in: userOids } }, { projection }).toArray();
  return new Map(users.map((user) => [String(user._id), user]));
}

router.get('/health', async (_req, res) => {
  try {
    res.json({ status: 'ok', mongo: await getDb().command({ ping: 1 }) });
  } catch (err) {
    res.status(500).json({ status: 'error', detail: String(err.message) });
  }
});

router.get('/summary', async (_req, res) => {
  try {
    const db = getDb();
    const [
      usersTotal,
      msgsTotal,
      msgsUser,
      convosTotal,
      dau,
      wau,
      mau,
      todayMsgs,
      weekMsgs,
    ] = await Promise.all([
      db.collection('users').countDocuments({}),
      db.collection('messages').countDocuments({}),
      db.collection('messages').countDocuments({ isCreatedByUser: true }),
      db.collection('conversations').countDocuments({}),
      db.collection('messages').distinct('user', { isCreatedByUser: true, createdAt: { $gte: ago(1) } }),
      db.collection('messages').distinct('user', { isCreatedByUser: true, createdAt: { $gte: ago(7) } }),
      db.collection('messages').distinct('user', { isCreatedByUser: true, createdAt: { $gte: ago(30) } }),
      db.collection('messages').countDocuments({ isCreatedByUser: true, createdAt: { $gte: ago(1) } }),
      db.collection('messages').countDocuments({ isCreatedByUser: true, createdAt: { $gte: ago(7) } }),
    ]);

    res.json({
      now: new Date().toISOString(),
      users_total: usersTotal,
      messages_total: msgsTotal,
      messages_user_total: msgsUser,
      conversations_total: convosTotal,
      dau: dau.length,
      wau: wau.length,
      mau: mau.length,
      messages_today: todayMsgs,
      messages_7d: weekMsgs,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/daily', async (req, res) => {
  try {
    const range = parseDateRange(req.query, 30);
    const data = await getDb().collection('messages').aggregate([
      { $match: { isCreatedByUser: true, createdAt: range } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Seoul' } },
          messages: { $sum: 1 },
          users: { $addToSet: '$user' },
        },
      },
      { $project: { _id: 0, date: '$_id', messages: 1, active_users: { $size: '$users' } } },
      { $sort: { date: 1 } },
    ]).toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/hourly', async (req, res) => {
  try {
    const range = parseDateRange(req.query, 7);
    const data = await getDb().collection('messages').aggregate([
      { $match: { isCreatedByUser: true, createdAt: range } },
      { $group: { _id: { $hour: { date: '$createdAt', timezone: 'Asia/Seoul' } }, messages: { $sum: 1 } } },
      { $project: { _id: 0, hour: '$_id', messages: 1 } },
      { $sort: { hour: 1 } },
    ]).toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/by-user', async (req, res) => {
  try {
    const range = parseDateRange(req.query, 30);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 500, 2000));
    const db = getDb();

    const rows = await db.collection('messages').aggregate([
      { $match: { isCreatedByUser: true, createdAt: range } },
      {
        $group: {
          _id: '$user',
          messages: { $sum: 1 },
          last_active: { $max: '$createdAt' },
          active_days_set: {
            $addToSet: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Seoul' },
            },
          },
        },
      },
      { $project: { messages: 1, last_active: 1, active_days: { $size: '$active_days_set' } } },
      { $sort: { messages: -1 } },
      { $limit: limit },
    ]).toArray();

    const userIds = rows.map((row) => row._id).filter(Boolean);
    let convoMap = new Map();
    if (userIds.length > 0) {
      const convos = await db.collection('conversations').aggregate([
        { $match: { user: { $in: userIds }, createdAt: range } },
        { $group: { _id: '$user', conversations: { $sum: 1 } } },
      ]).toArray();
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
        return {
          user_id: String(row._id),
          name: user.name ?? null,
          username: user.username ?? null,
          bkl_user_class: user.bkl_user_class ?? null,
          bkl_user_id: user.bkl_user_id ?? null,
          email: user.email ?? null,
          messages: row.messages,
          active_days: row.active_days,
          conversations: convoMap.get(String(row._id)) ?? 0,
          last_active: row.last_active,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/by-model', async (req, res) => {
  try {
    const range = parseDateRange(req.query, 30);
    const data = await getDb().collection('messages').aggregate([
      { $match: { isCreatedByUser: false, createdAt: range } },
      { $group: { _id: '$model', messages: { $sum: 1 } } },
      { $project: { _id: 0, model: '$_id', messages: 1 } },
      { $sort: { messages: -1 } },
    ]).toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/usage/by-group', async (req, res) => {
  try {
    const range = parseDateRange(req.query, 30);
    const data = await getDb().collection('messages').aggregate([
      { $match: { isCreatedByUser: true, createdAt: range } },
      { $addFields: { user_oid: { $toObjectId: '$user' } } },
      { $lookup: { from: 'users', localField: 'user_oid', foreignField: '_id', as: 'u' } },
      { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$u.bkl_user_class', 'unknown'] },
          messages: { $sum: 1 },
          users: { $addToSet: '$user' },
        },
      },
      { $project: { _id: 0, user_class: '$_id', messages: 1, active_users: { $size: '$users' } } },
      { $sort: { messages: -1 } },
    ]).toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/users', async (_req, res) => {
  try {
    const users = await getDb().collection('users').find({}, {
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
    }).toArray();
    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/messages/recent', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 50, 500));
    const db = getDb();
    const msgs = await db.collection('messages').find(
      { isCreatedByUser: true },
      { projection: { messageId: 1, user: 1, text: 1, createdAt: 1, conversationId: 1, model: 1 } },
    ).sort({ createdAt: -1 }).limit(limit).toArray();

    const userMap = await loadUsers(
      db,
      [...new Set(msgs.map((msg) => msg.user).filter(Boolean))],
      { name: 1, username: 1, bkl_user_class: 1 },
    );

    res.json({
      data: msgs.map((msg) => {
        const user = userMap.get(String(msg.user)) || {};
        return {
          ...msg,
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

router.get('/sessions/by-user', async (req, res) => {
  try {
    const { user_id: userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'user_id required' });
    }

    const range = parseDateRange(req.query, 365);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const db = getDb();

    const convos = await db.collection('conversations').find(
      { user: userId, createdAt: range },
      { projection: { conversationId: 1, title: 1, createdAt: 1, updatedAt: 1 } },
    ).sort({ updatedAt: -1 }).limit(limit).toArray();

    if (!convos.length) {
      return res.json({ data: [] });
    }

    const convoIds = convos.map((convo) => convo.conversationId).filter(Boolean);
    const msgStats = await db.collection('messages').aggregate([
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
    ]).toArray();
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

    const msgs = await getDb().collection('messages').find(
      { conversationId },
      { projection: { isCreatedByUser: 1, text: 1, content: 1, createdAt: 1, model: 1, sender: 1 } },
    ).sort({ createdAt: 1 }).toArray();

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

router.use((err, _req, res, _next) => {
  logger.error('[bkl-admin-api] request failed', err);
  res.status(500).json({ error: String(err.message || err) });
});

module.exports = router;
