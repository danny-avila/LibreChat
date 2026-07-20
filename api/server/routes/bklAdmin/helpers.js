const mongoose = require('mongoose');

const ago = (days) => new Date(Date.now() - days * 24 * 3600 * 1000);

/**
 * Parses `from`/`to`/`days` query params into a Mongo date range.
 * Returns `{ range, prevRange }` where `prevRange` is the immediately
 * preceding period of equal length (used for `compare=prev`).
 */
function parseDateRange(query, defaultDays = 30) {
  let $gte;
  let $lte = new Date();
  if (query.from) {
    $gte = new Date(`${query.from}T00:00:00+09:00`);
    if (query.to) {
      $lte = new Date(`${query.to}T23:59:59+09:00`);
    }
  } else {
    const days = Math.max(1, Math.min(parseInt(query.days, 10) || defaultDays, 365));
    $gte = ago(days);
  }
  const spanMs = $lte.getTime() - $gte.getTime();
  const prevRange = {
    $gte: new Date($gte.getTime() - spanMs),
    $lt: $gte,
  };
  return { range: { $gte, $lte }, prevRange };
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

  const users = await db
    .collection('users')
    .find({ _id: { $in: userOids } }, { projection })
    .toArray();
  return new Map(users.map((user) => [String(user._id), user]));
}

module.exports = { ago, parseDateRange, getDb, loadUsers };
