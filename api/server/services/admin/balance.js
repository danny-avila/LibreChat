const mongoose = require('mongoose');
const { Balance, User } = require('~/db/models');

/**
 * Build the public-facing balance shape: just the credit total plus the
 * autoRefill block. Avoid leaking internal fields.
 *
 * @param {object} record - Raw balance document.
 * @returns {{ tokenCredits: number, autoRefill: { enabled: boolean, intervalValue: number, intervalUnit: string, amount: number, lastRefill: Date|null } }}
 */
function shapeBalance(record) {
  return {
    tokenCredits: record.tokenCredits ?? 0,
    autoRefill: {
      enabled: Boolean(record.autoRefillEnabled),
      intervalValue: record.refillIntervalValue ?? 0,
      intervalUnit: record.refillIntervalUnit || 'days',
      amount: record.refillAmount ?? 0,
      lastRefill: record.lastRefill ?? null,
    },
  };
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

/**
 * Read the balance row for a user.
 * Throws `{ code: 'NO_BALANCE' }` if no row exists.
 *
 * @param {string} userId
 * @returns {Promise<{ tokenCredits: number, autoRefill: object }>}
 */
async function getBalanceForUser(userId) {
  assertObjectId(userId);
  const record = await Balance.findOne({ user: userId }).lean();
  if (!record) {
    const err = new Error('No balance for user');
    err.code = 'NO_BALANCE';
    throw err;
  }
  return shapeBalance(record);
}

/**
 * Atomically adjust the balance by `delta` (positive or negative).
 * For negative deltas, refuses to go below zero (returns INSUFFICIENT_BALANCE).
 * Upserts a row if none exists (and the resulting value would be >= 0).
 *
 * @param {string} userId
 * @param {{ delta: number, reason: string, actorId?: string }} args
 * @returns {Promise<{ before: number, after: number }>}
 */
async function adjustBalance(userId, { delta }) {
  assertObjectId(userId);
  if (typeof delta !== 'number' || !Number.isFinite(delta) || !Number.isInteger(delta)) {
    const err = new Error('Invalid delta');
    err.code = 'INVALID_DELTA';
    throw err;
  }
  await assertUserExists(userId);

  // Capture before snapshot. We use a separate read for the audit `before`,
  // then enforce the underflow guard atomically inside findOneAndUpdate.
  const beforeDoc = await Balance.findOne({ user: userId }).lean();
  const before = beforeDoc?.tokenCredits ?? 0;

  if (delta < 0 && before + delta < 0) {
    const err = new Error('Insufficient balance');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  // Build a filter that prevents underflow even under concurrent updates.
  const filter = { user: userId };
  if (delta < 0) {
    filter.tokenCredits = { $gte: -delta };
  }

  const updated = await Balance.findOneAndUpdate(
    filter,
    { $inc: { tokenCredits: delta } },
    { new: true, upsert: delta >= 0 },
  ).lean();

  if (!updated) {
    // Filter didn't match — must be a concurrent underflow.
    const err = new Error('Insufficient balance');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  return { before, after: updated.tokenCredits ?? 0 };
}

/**
 * Atomically set the balance to an absolute, non-negative integer.
 * Upserts a row if none exists.
 *
 * @param {string} userId
 * @param {{ tokenCredits: number, reason: string, actorId?: string }} args
 * @returns {Promise<{ before: number, after: number }>}
 */
async function setBalance(userId, { tokenCredits }) {
  assertObjectId(userId);
  if (
    typeof tokenCredits !== 'number' ||
    !Number.isFinite(tokenCredits) ||
    !Number.isInteger(tokenCredits) ||
    tokenCredits < 0
  ) {
    const err = new Error('Invalid tokenCredits');
    err.code = 'INVALID_TOKEN_CREDITS';
    throw err;
  }
  await assertUserExists(userId);

  const beforeDoc = await Balance.findOne({ user: userId }).lean();
  const before = beforeDoc?.tokenCredits ?? 0;

  const updated = await Balance.findOneAndUpdate(
    { user: userId },
    { $set: { tokenCredits } },
    { new: true, upsert: true },
  ).lean();

  return { before, after: updated.tokenCredits ?? 0 };
}

module.exports = {
  getBalanceForUser,
  adjustBalance,
  setBalance,
  shapeBalance,
};
