const mongoose = require('mongoose');
const { User, Transaction, Message, SubscriptionProfile } = require('~/db/models');

const VALID_RANGES = new Set(['7d', '30d', '90d']);
const VALID_GRANULARITIES = new Set(['day', 'week']);
const VALID_TOKEN_TYPES = new Set(['prompt', 'completion', 'credits']);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function rangeDays(range) {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

function assertObjectId(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id');
    err.code = 'INVALID_USER_ID';
    throw err;
  }
}

async function assertUserExists(userId) {
  const exists = await User.exists({ _id: userId });
  if (!exists) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
}

function clampLimit(limit) {
  const parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function clampPage(page) {
  const parsed = parseInt(page, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE;
  }
  return parsed;
}

function startOfUtcDay(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

/**
 * Build a $dateTrunc expression for either day or week granularity.
 */
function dateTruncExpr(granularity) {
  return {
    $dateTrunc: {
      date: '$createdAt',
      unit: granularity === 'week' ? 'week' : 'day',
      timezone: 'UTC',
    },
  };
}

/**
 * Get usage timeseries for a single user.
 * @param {string} userId
 * @param {{ range?: string, granularity?: string }} opts
 */
async function getUsageForUser(userId, { range = '30d', granularity = 'day' } = {}) {
  assertObjectId(userId);
  if (!VALID_RANGES.has(range)) {
    const err = new Error('Invalid range');
    err.code = 'INVALID_RANGE';
    throw err;
  }
  if (!VALID_GRANULARITIES.has(granularity)) {
    const err = new Error('Invalid granularity');
    err.code = 'INVALID_GRANULARITY';
    throw err;
  }
  await assertUserExists(userId);

  const days = rangeDays(range);
  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const userOid = new mongoose.Types.ObjectId(userId);
  const match = {
    user: userOid,
    createdAt: { $gte: rangeStart, $lte: rangeEnd },
    tokenType: { $in: ['prompt', 'completion'] },
  };

  // tokens grouped by bucket and tokenType
  const byBucketRows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { bucket: dateTruncExpr(granularity), tokenType: '$tokenType' },
        tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
      },
    },
    { $sort: { '_id.bucket': 1 } },
  ]);

  // tokens grouped by model and tokenType
  const byModelRows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { model: '$model', tokenType: '$tokenType' },
        tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
      },
    },
  ]);

  const byDayMap = new Map();
  for (const row of byBucketRows) {
    const date = row._id.bucket ? new Date(row._id.bucket).toISOString() : null;
    if (!date) continue;
    if (!byDayMap.has(date)) {
      byDayMap.set(date, { date, prompt: 0, completion: 0, totalTokens: 0 });
    }
    const entry = byDayMap.get(date);
    if (row._id.tokenType === 'prompt') entry.prompt += row.tokens;
    if (row._id.tokenType === 'completion') entry.completion += row.tokens;
    entry.totalTokens = entry.prompt + entry.completion;
  }
  const byDay = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const byModelMap = new Map();
  for (const row of byModelRows) {
    const key = row._id.model || 'unknown';
    if (!byModelMap.has(key)) {
      byModelMap.set(key, { model: key, prompt: 0, completion: 0, totalTokens: 0 });
    }
    const entry = byModelMap.get(key);
    if (row._id.tokenType === 'prompt') entry.prompt += row.tokens;
    if (row._id.tokenType === 'completion') entry.completion += row.tokens;
    entry.totalTokens = entry.prompt + entry.completion;
  }
  const byModel = Array.from(byModelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);

  const totals = byDay.reduce(
    (acc, d) => {
      acc.prompt += d.prompt;
      acc.completion += d.completion;
      return acc;
    },
    { prompt: 0, completion: 0 },
  );

  return {
    rangeStart,
    rangeEnd,
    granularity,
    byDay,
    byModel,
    totals,
  };
}

/**
 * Paginated transaction list with optional filters.
 */
async function listTransactions({ userId, from, to, tokenType, model, page, limit } = {}) {
  const filter = {};
  if (userId !== undefined && userId !== null && userId !== '') {
    assertObjectId(userId);
    filter.user = new mongoose.Types.ObjectId(userId);
  }
  if (tokenType !== undefined && tokenType !== null && tokenType !== '') {
    if (!VALID_TOKEN_TYPES.has(tokenType)) {
      const err = new Error('Invalid tokenType');
      err.code = 'INVALID_TOKEN_TYPE';
      throw err;
    }
    filter.tokenType = tokenType;
  }
  if (model !== undefined && model !== null && model !== '') {
    filter.model = String(model);
  }

  const dateFilter = {};
  if (from !== undefined && from !== null && from !== '') {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) {
      const err = new Error('Invalid from date');
      err.code = 'INVALID_FROM';
      throw err;
    }
    dateFilter.$gte = d;
  }
  if (to !== undefined && to !== null && to !== '') {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) {
      const err = new Error('Invalid to date');
      err.code = 'INVALID_TO';
      throw err;
    }
    dateFilter.$lte = d;
  }
  // Default to a 90-day window when neither bound is supplied. Without this,
  // an unfiltered countDocuments over a large transaction collection can be
  // slow enough to time out the request.
  if (Object.keys(dateFilter).length === 0) {
    dateFilter.$gte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  }
  filter.createdAt = dateFilter;

  const p = clampPage(page);
  const l = clampLimit(limit);
  const skip = (p - 1) * l;

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .select(
        'user conversationId tokenType model context rate rawAmount tokenValue inputTokens writeTokens readTokens createdAt',
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  // Enrich each transaction with the user's email/name so the UI doesn't have
  // to do a second roundtrip per row. Single $in query, lean projection.
  const userIds = [...new Set(items.map((t) => (t.user ? String(t.user) : null)).filter(Boolean))];
  const userMap = new Map();
  if (userIds.length > 0) {
    const users = await User.find(
      { _id: { $in: userIds } },
      { email: 1, name: 1, username: 1 },
    ).lean();
    for (const u of users) {
      userMap.set(String(u._id), {
        email: u.email || null,
        name: u.name || null,
        username: u.username || null,
      });
    }
  }
  const enriched = items.map((t) => {
    const u = t.user ? userMap.get(String(t.user)) : null;
    return {
      ...t,
      userEmail: u?.email ?? null,
      userName: u?.name ?? u?.username ?? null,
    };
  });

  return { items: enriched, page: p, limit: l, total };
}

/**
 * Build org-wide overview stats.
 */
async function getOverviewStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOf30 = startOfUtcDay(thirtyDaysAgo);

  const totalUsers = await User.countDocuments({});

  // Active users = unique senders of messages in last 30d. Message.user is a String (id string).
  const activeUsersAgg = await Message.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: '$user' } },
    { $count: 'count' },
  ]);
  const activeUsers30d = activeUsersAgg[0]?.count || 0;

  let activeProUsers = 0;
  if (SubscriptionProfile) {
    activeProUsers = await SubscriptionProfile.countDocuments({ isPro: true });
  }

  const messages30d = await Message.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

  const tokensAgg = await Transaction.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        tokenType: { $in: ['prompt', 'completion'] },
      },
    },
    {
      $group: {
        _id: null,
        tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
      },
    },
  ]);
  const tokens30d = tokensAgg[0]?.tokens || 0;

  // DAU timeseries: distinct users by day for the last 30 days
  const dauAgg = await Message.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: {
          bucket: { $dateTrunc: { date: '$createdAt', unit: 'day', timezone: 'UTC' } },
          user: '$user',
        },
      },
    },
    {
      $group: {
        _id: '$_id.bucket',
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const messagesByDayAgg = await Message.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: { $dateTrunc: { date: '$createdAt', unit: 'day', timezone: 'UTC' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Build complete 30-day series with zero-fills.
  const dayBuckets = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(startOf30.getTime() + (29 - i) * 24 * 60 * 60 * 1000);
    dayBuckets.push(d);
  }

  const dauMap = new Map();
  for (const row of dauAgg) {
    if (row._id) {
      const key = startOfUtcDay(row._id).toISOString();
      dauMap.set(key, row.count);
    }
  }
  const msgMap = new Map();
  for (const row of messagesByDayAgg) {
    if (row._id) {
      const key = startOfUtcDay(row._id).toISOString();
      msgMap.set(key, row.count);
    }
  }

  const dauTimeseries = dayBuckets.map((d) => ({
    date: d.toISOString(),
    count: dauMap.get(d.toISOString()) || 0,
  }));
  const messagesByDay = dayBuckets.map((d) => ({
    date: d.toISOString(),
    count: msgMap.get(d.toISOString()) || 0,
  }));

  return {
    totalUsers,
    activeUsers30d,
    activeProUsers,
    messages30d,
    tokens30d,
    dauTimeseries,
    messagesByDay,
  };
}

/**
 * Org-wide usage timeseries (tokens by day + by model). Same shape as
 * getUsageForUser, but cross-user.
 */
async function getOrgUsage({ range = '30d' } = {}) {
  if (range === '7d') {
    // Defensive: spec says only 30d/90d, but we accept anything in
    // VALID_RANGES; route layer enforces 30d|90d.
  }
  if (!VALID_RANGES.has(range)) {
    const err = new Error('Invalid range');
    err.code = 'INVALID_RANGE';
    throw err;
  }

  const days = rangeDays(range);
  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const match = {
    createdAt: { $gte: rangeStart, $lte: rangeEnd },
    tokenType: { $in: ['prompt', 'completion'] },
  };

  const byBucketRows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { bucket: dateTruncExpr('day'), tokenType: '$tokenType' },
        tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
      },
    },
    { $sort: { '_id.bucket': 1 } },
  ]);
  const byModelRows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { model: '$model', tokenType: '$tokenType' },
        tokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
      },
    },
  ]);

  const byDayMap = new Map();
  for (const row of byBucketRows) {
    const date = row._id.bucket ? new Date(row._id.bucket).toISOString() : null;
    if (!date) continue;
    if (!byDayMap.has(date)) {
      byDayMap.set(date, { date, prompt: 0, completion: 0, totalTokens: 0 });
    }
    const entry = byDayMap.get(date);
    if (row._id.tokenType === 'prompt') entry.prompt += row.tokens;
    if (row._id.tokenType === 'completion') entry.completion += row.tokens;
    entry.totalTokens = entry.prompt + entry.completion;
  }
  const byDay = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const byModelMap = new Map();
  for (const row of byModelRows) {
    const key = row._id.model || 'unknown';
    if (!byModelMap.has(key)) {
      byModelMap.set(key, { model: key, prompt: 0, completion: 0, totalTokens: 0 });
    }
    const entry = byModelMap.get(key);
    if (row._id.tokenType === 'prompt') entry.prompt += row.tokens;
    if (row._id.tokenType === 'completion') entry.completion += row.tokens;
    entry.totalTokens = entry.prompt + entry.completion;
  }
  const byModel = Array.from(byModelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);

  const totals = byDay.reduce(
    (acc, d) => {
      acc.prompt += d.prompt;
      acc.completion += d.completion;
      return acc;
    },
    { prompt: 0, completion: 0 },
  );

  return {
    rangeStart,
    rangeEnd,
    granularity: 'day',
    byDay,
    byModel,
    totals,
  };
}

module.exports = {
  getUsageForUser,
  listTransactions,
  getOverviewStats,
  getOrgUsage,
  // exposed for tests
  _internal: {
    VALID_RANGES,
    VALID_GRANULARITIES,
    VALID_TOKEN_TYPES,
    MAX_LIMIT,
  },
};
