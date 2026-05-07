const mongoose = require('mongoose');
const { AdminAuditActions } = require('@librechat/data-schemas');
const { AdminAuditLog } = require('~/db/models');

const TARGET_TYPES = new Set([
  'user',
  'subscription',
  'balance',
  'transaction',
  'message',
  'conversation',
  'audit',
  'system',
]);

const STATUS_VALUES = new Set(['success', 'failure']);
const SORT_WHITELIST = new Set(['createdAt', '-createdAt']);
const ACTION_VALUES = new Set(Object.values(AdminAuditActions));

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isValidObjectId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseIsoDate(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    const err = new Error(`Invalid date for ${fieldName}`);
    err.code = 'INVALID_DATE';
    err.field = fieldName;
    throw err;
  }
  return dt;
}

function clampPositiveInt(value, fallback, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  if (max && n > max) return max;
  return n;
}

/**
 * List audit log rows with filtering, pagination, and sort.
 * @param {object} params
 * @returns {Promise<{ items: object[], page: number, limit: number, total: number }>}
 */
async function listAudit(params = {}) {
  const {
    actorId,
    action,
    targetType,
    targetId,
    status,
    from,
    to,
    q,
    sort: sortRaw,
    page: pageRaw,
    limit: limitRaw,
  } = params;

  const filter = {};

  if (actorId !== undefined && actorId !== null && actorId !== '') {
    if (!isValidObjectId(actorId)) {
      const err = new Error('Invalid actorId');
      err.code = 'INVALID_ACTOR_ID';
      throw err;
    }
    filter.actorId = new mongoose.Types.ObjectId(actorId);
  }

  if (action !== undefined && action !== null && action !== '') {
    if (!ACTION_VALUES.has(action)) {
      const err = new Error('Invalid action');
      err.code = 'INVALID_ACTION';
      throw err;
    }
    filter.action = action;
  }

  if (targetType !== undefined && targetType !== null && targetType !== '') {
    if (!TARGET_TYPES.has(targetType)) {
      const err = new Error('Invalid targetType');
      err.code = 'INVALID_TARGET_TYPE';
      throw err;
    }
    filter.targetType = targetType;
  }

  if (targetId !== undefined && targetId !== null && targetId !== '') {
    filter.targetId = String(targetId);
  }

  if (status !== undefined && status !== null && status !== '') {
    if (!STATUS_VALUES.has(status)) {
      const err = new Error('Invalid status');
      err.code = 'INVALID_STATUS';
      throw err;
    }
    filter.status = status;
  }

  const fromDate = parseIsoDate(from, 'from');
  const toDate = parseIsoDate(to, 'to');
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = fromDate;
    if (toDate) filter.createdAt.$lte = toDate;
  }

  if (q !== undefined && q !== null && q !== '') {
    const escaped = escapeRegex(q);
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ actorEmail: regex }, { targetId: regex }, { reason: regex }];
  }

  const sort = SORT_WHITELIST.has(sortRaw) ? sortRaw : '-createdAt';
  const page = clampPositiveInt(pageRaw, 1);
  const limit = clampPositiveInt(limitRaw, DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AdminAuditLog.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    AdminAuditLog.countDocuments(filter),
  ]);

  return { items, page, limit, total };
}

/**
 * Fetch a single audit log entry by id.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getAudit(id) {
  if (!isValidObjectId(id)) {
    const err = new Error('Invalid id');
    err.code = 'INVALID_ID';
    throw err;
  }
  const row = await AdminAuditLog.findById(id).lean();
  if (!row) {
    const err = new Error('Audit log not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return row;
}

/**
 * Aggregate distinct action values + counts in the last 30 days.
 * @returns {Promise<Array<{ action: string, count: number }>>}
 */
async function listRecentActions() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await AdminAuditLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$action', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  return rows.map((r) => ({ action: r._id, count: r.count }));
}

module.exports = {
  listAudit,
  getAudit,
  listRecentActions,
  // exported for tests / reuse
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
