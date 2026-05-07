const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { webcrypto } = require('node:crypto');
const { logger } = require('@librechat/data-schemas');
const { checkEmailConfig } = require('@librechat/api');
const { SystemRoles, ViolationTypes } = require('librechat-data-provider');
const {
  User,
  Balance,
  SubscriptionProfile,
  Agent,
  Assistant,
  ConversationTag,
  Conversation,
  Message,
  File,
  Key,
  MemoryEntry,
  PluginAuth,
  Prompt,
  PromptGroup,
  Preset,
  Session,
  SharedLink,
  ToolCall,
  Token,
  Transaction,
} = require('~/db/models');
const { createToken, deleteTokens, deleteAllUserSessions } = require('~/models');
const { sendEmail } = require('~/server/utils');
const getLogStores = require('~/cache/getLogStores');
const { createInvite } = require('~/models/inviteUser');

const SAFE_USER_FIELDS =
  '-password -backupCodes -totpSecret -refreshToken -googleId -facebookId -openidId -samlId -ldapId -githubId -discordId -appleId';

const ALLOWED_SORTS = new Set(['email', '-email', 'createdAt', '-createdAt', 'name', '-name']);

const ALLOWED_ROLES = new Set([SystemRoles.ADMIN, SystemRoles.USER]);

function typedError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function assertObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw typedError('INVALID_ID', 'Invalid id', 400);
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Allowlist of fields safe to return from any admin user response. New
// sensitive fields added to the User schema later cannot accidentally leak
// because they will not appear in this list.
const SAFE_USER_KEYS = [
  '_id',
  'email',
  'username',
  'name',
  'avatar',
  'role',
  'provider',
  'emailVerified',
  'twoFactorEnabled',
  'createdAt',
  'updatedAt',
  // Admin-derived annotations attached after fetch.
  'banned',
  'banReason',
];

function sanitizeUser(user) {
  if (!user) return null;
  const u = typeof user.toObject === 'function' ? user.toObject() : user;
  const out = {};
  for (const key of SAFE_USER_KEYS) {
    if (u[key] !== undefined) {
      out[key] = u[key];
    }
  }
  return out;
}

function shapeBalance(record) {
  if (!record) return null;
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

function shapeSubscription(record) {
  if (!record) return null;
  return {
    isPro: Boolean(record.isPro),
    currentPlan: record.currentPlan ?? null,
    productId: record.productId ?? null,
    store: record.store ?? null,
    expiresAt: record.expiresAt ?? null,
    quota: record.quota
      ? {
          period: record.quota.period,
          usedMessages: record.quota.usedMessages ?? 0,
          limit: record.quota.limit ?? 0,
        }
      : null,
    manualOverride: record.manualOverride
      ? {
          enabled: Boolean(record.manualOverride.enabled),
          mode: record.manualOverride.mode ?? null,
          source: record.manualOverride.source ?? null,
          updatedAt: record.manualOverride.updatedAt ?? null,
        }
      : null,
    lastSyncedAt: record.lastSyncedAt ?? null,
  };
}

/**
 * List users with filtering, sorting, pagination.
 * Sensitive fields are stripped server-side.
 */
async function listUsers({
  q,
  role,
  provider,
  banned,
  createdAfter,
  createdBefore,
  sort = '-createdAt',
  page = 1,
  limit = 25,
} = {}) {
  const safeSort = ALLOWED_SORTS.has(sort) ? sort : null;
  if (!safeSort) {
    throw typedError('BAD_SORT', `Invalid sort: ${sort}`, 400);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const filter = {};

  if (q && typeof q === 'string' && q.trim().length > 0) {
    const regex = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ email: regex }, { name: regex }, { username: regex }];
  }

  if (role) {
    if (!ALLOWED_ROLES.has(role)) {
      throw typedError('BAD_ROLE', `Invalid role: ${role}`, 400);
    }
    filter.role = role;
  }

  if (provider) {
    filter.provider = String(provider);
  }

  if (createdAfter || createdBefore) {
    filter.createdAt = {};
    if (createdAfter) {
      const d = new Date(createdAfter);
      if (Number.isNaN(d.getTime())) {
        throw typedError('BAD_DATE', 'Invalid createdAfter', 400);
      }
      filter.createdAt.$gte = d;
    }
    if (createdBefore) {
      const d = new Date(createdBefore);
      if (Number.isNaN(d.getTime())) {
        throw typedError('BAD_DATE', 'Invalid createdBefore', 400);
      }
      filter.createdAt.$lte = d;
    }
  }

  // When the caller filters by banned status, push the constraint into the
  // Mongo query so pagination and totals are accurate. Bans are stored in a
  // cache (keyed by user id), so we resolve the universe of banned ids first
  // then narrow the User query with $in / $nin.
  let bannedIds = null;
  const wantBanned =
    banned === true || banned === 'true'
      ? true
      : banned === false || banned === 'false'
        ? false
        : null;
  if (wantBanned !== null) {
    const banLogs = getLogStores(ViolationTypes.BAN);
    const ids = await collectBannedUserIds(banLogs);
    bannedIds = ids;
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    filter._id = wantBanned ? { $in: objectIds } : { $nin: objectIds };
  }

  const [items, total] = await Promise.all([
    User.find(filter).select(SAFE_USER_FIELDS).sort(safeSort).skip(skip).limit(safeLimit).lean(),
    User.countDocuments(filter),
  ]);

  // Annotate each user with banned status (cache-derived). When we already
  // constrained the query above we know the answer; otherwise look it up.
  const banLogs = getLogStores(ViolationTypes.BAN);
  const annotated =
    bannedIds !== null
      ? items.map((u) => ({ ...u, banned: wantBanned }))
      : await Promise.all(
          items.map(async (u) => ({ ...u, banned: !!(await banLogs.get(String(u._id))) })),
        );

  return {
    items: annotated.map((u) => sanitizeUser(u)),
    page: safePage,
    limit: safeLimit,
    total,
  };
}

/**
 * Resolve the full set of currently-banned user ids by enumerating the BAN
 * Keyv store. Returns string ObjectIds. Falls back to an empty list if the
 * store does not support iteration.
 */
async function collectBannedUserIds(banLogs) {
  if (!banLogs || typeof banLogs.iterator !== 'function') {
    return [];
  }
  const ids = [];
  try {
    for await (const [key] of banLogs.iterator()) {
      // Keyv may return namespaced keys like "ban:<id>"; normalize.
      const id = String(key).split(':').pop();
      if (mongoose.Types.ObjectId.isValid(id)) {
        ids.push(id);
      }
    }
  } catch (err) {
    logger.warn('[admin listUsers] failed to enumerate ban store', err);
  }
  return ids;
}

/**
 * Get a user's detail along with a subscription summary and balance summary.
 */
async function getUserDetail(userId) {
  assertObjectId(userId);
  const user = await User.findById(userId).select(SAFE_USER_FIELDS).lean();
  if (!user) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }

  const [subscription, balance] = await Promise.all([
    SubscriptionProfile.findOne({ userId }).lean(),
    Balance.findOne({ user: userId }).lean(),
  ]);

  // Banned status from cache.
  let isBanned = false;
  try {
    const banLogs = getLogStores(ViolationTypes.BAN);
    isBanned = !!(await banLogs.get(String(userId)));
  } catch (_e) {
    /* ignore */
  }

  return {
    user: { ...sanitizeUser(user), banned: isBanned },
    subscription: shapeSubscription(subscription),
    balance: shapeBalance(balance),
  };
}

/**
 * Ban a user via the cache-driven ban store.
 * The duration is read from the BAN log store's TTL.
 */
async function banUser(userId, { reason } = {}) {
  assertObjectId(userId);
  if (!reason || typeof reason !== 'string') {
    throw typedError('REASON_REQUIRED', 'reason is required', 400);
  }
  const trimmed = reason.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw typedError('REASON_LENGTH', 'reason must be 1..500 chars', 400);
  }

  const user = await User.findById(userId).select(SAFE_USER_FIELDS).lean();
  if (!user) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }

  const banLogs = getLogStores(ViolationTypes.BAN);
  const duration = banLogs?.opts?.ttl;
  // checkBan short-circuits when duration <= 0, so writing a ban entry under
  // those conditions is silently a no-op. Refuse loudly so the operator can
  // configure BAN_VIOLATIONS=true and BAN_DURATION before banning users.
  if (!duration || duration <= 0) {
    throw typedError(
      'BAN_NOT_CONFIGURED',
      'Bans require BAN_VIOLATIONS=true and a positive BAN_DURATION',
      503,
    );
  }

  const before = { banned: false, banReason: null };

  // Invalidate all active sessions so the ban takes effect immediately.
  try {
    await deleteAllUserSessions({ userId: String(user._id) });
  } catch (err) {
    logger.warn('[admin banUser] failed to delete sessions', err);
  }

  const expiresAt = Date.now() + duration;
  await banLogs.set(String(user._id), {
    type: ViolationTypes.CONCURRENT,
    user_id: String(user._id),
    violation_count: 1,
    duration,
    expiresAt,
    reason: trimmed,
  });

  const after = { banned: true, banReason: trimmed };

  return {
    user: { ...user, banned: true, banReason: trimmed },
    before,
    after,
  };
}

async function unbanUser(userId, { reason } = {}) {
  assertObjectId(userId);
  // Unban is destructive enough to demand a reason for the audit trail —
  // banUser already enforces this, and asymmetric validation here would let
  // admins quietly reverse other admins' bans with no record.
  if (!reason || typeof reason !== 'string') {
    throw typedError('REASON_REQUIRED', 'reason is required', 400);
  }
  const trimmed = reason.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw typedError('REASON_LENGTH', 'reason must be 1..500 chars', 400);
  }

  const user = await User.findById(userId).select(SAFE_USER_FIELDS).lean();
  if (!user) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }

  const banLogs = getLogStores(ViolationTypes.BAN);
  const existing = await banLogs.get(String(user._id));
  const before = { banned: !!existing, banReason: existing?.reason || null };

  await banLogs.delete(String(user._id));

  const after = { banned: false, banReason: null };

  return {
    user: { ...user, banned: false, banReason: null },
    before,
    after,
    reason: trimmed,
  };
}

/**
 * Change a user's role. Enforces:
 *   - cannot change own role
 *   - cannot demote the last remaining admin
 */
async function changeUserRole(userId, { role, actorId } = {}) {
  assertObjectId(userId);
  if (!role || !ALLOWED_ROLES.has(role)) {
    throw typedError('BAD_ROLE', `role must be one of ${[...ALLOWED_ROLES].join(', ')}`, 400);
  }

  if (actorId && String(actorId) === String(userId)) {
    throw typedError('SELF_ROLE_CHANGE', 'Cannot change your own role', 400);
  }

  const user = await User.findById(userId).select(SAFE_USER_FIELDS).lean();
  if (!user) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }

  const before = { role: user.role || SystemRoles.USER };

  if (before.role === role) {
    return {
      user: { ...user },
      before,
      after: { role },
      changed: false,
    };
  }

  // Last-admin guard: count *other* admins before allowing demotion.
  // Counting all admins (including this user) leaves a TOCTOU race where two
  // concurrent demotions can both pass the check and end with zero admins.
  if (before.role === SystemRoles.ADMIN && role === SystemRoles.USER) {
    const otherAdmins = await User.countDocuments({
      role: SystemRoles.ADMIN,
      _id: { $ne: userId },
    });
    if (otherAdmins < 1) {
      throw typedError('LAST_ADMIN', 'Cannot demote the last remaining admin', 400);
    }
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { role } },
    { new: true, runValidators: true },
  )
    .select(SAFE_USER_FIELDS)
    .lean();

  // Defense in depth: re-verify post-update. If we somehow ended at zero
  // admins (concurrent race), restore the role and surface the failure.
  if (before.role === SystemRoles.ADMIN && role === SystemRoles.USER) {
    const remainingAdmins = await User.countDocuments({ role: SystemRoles.ADMIN });
    if (remainingAdmins < 1) {
      await User.findByIdAndUpdate(userId, { $set: { role: SystemRoles.ADMIN } });
      throw typedError('LAST_ADMIN', 'Cannot demote the last remaining admin', 400);
    }
  }

  return {
    user: updated,
    before,
    after: { role },
    changed: true,
  };
}

/**
 * Generate a one-time password reset token for the user and email them
 * a reset link, mirroring the public flow.
 */
async function requestPasswordReset(userId) {
  assertObjectId(userId);
  if (!checkEmailConfig()) {
    throw typedError('EMAIL_NOT_CONFIGURED', 'Email service is not configured', 503);
  }
  const user = await User.findById(userId).lean();
  if (!user) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }

  await deleteTokens({ userId: user._id });

  const token = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const hash = bcrypt.hashSync(token, 10);

  await createToken({
    userId: user._id,
    token: hash,
    createdAt: Date.now(),
    expiresIn: 900,
  });

  const clientDomain = process.env.DOMAIN_CLIENT || '';
  const link = `${clientDomain}/reset-password?token=${token}&userId=${user._id}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request',
      payload: {
        appName: process.env.APP_TITLE || 'LibreChat',
        name: user.name || user.username || user.email,
        link,
        year: new Date().getFullYear(),
      },
      template: 'requestPasswordReset.handlebars',
    });
  } catch (err) {
    logger.error('[admin requestPasswordReset] failed to send email', err);
    throw typedError('EMAIL_SEND_FAILED', 'Failed to send password reset email', 502);
  }

  return { ok: true };
}

/**
 * Invite a user. Refuses to invite an email that already maps to a banned user.
 */
async function inviteUser({ email, name } = {}) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw typedError('BAD_EMAIL', 'Valid email is required', 400);
  }
  if (!checkEmailConfig()) {
    throw typedError('EMAIL_NOT_CONFIGURED', 'Email service is not configured', 503);
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).select('_id email').lean();
  if (existing) {
    // If the existing user is banned, refuse explicitly.
    try {
      const banLogs = getLogStores(ViolationTypes.BAN);
      const banned = await banLogs.get(String(existing._id));
      if (banned) {
        throw typedError('USER_BANNED', 'A banned user already exists with that email', 400);
      }
    } catch (err) {
      if (err && err.code === 'USER_BANNED') {
        throw err;
      }
    }
    throw typedError('USER_EXISTS', 'A user with that email already exists', 400);
  }

  const token = await createInvite(normalizedEmail);
  if (token && token.message) {
    throw typedError('INVITE_FAILED', token.message, 500);
  }

  const inviteLink = `${process.env.DOMAIN_CLIENT || ''}/register?token=${token}`;
  const appName = process.env.APP_TITLE || 'LibreChat';

  try {
    await sendEmail({
      email: normalizedEmail,
      subject: `Invite to join ${appName}!`,
      payload: {
        appName,
        name: name || normalizedEmail,
        inviteLink,
        year: new Date().getFullYear(),
      },
      template: 'inviteUser.handlebars',
    });
  } catch (err) {
    logger.error('[admin inviteUser] failed to send invite email', err);
    throw typedError('EMAIL_SEND_FAILED', 'Failed to send invite email', 502);
  }

  return { ok: true, email: normalizedEmail };
}

/**
 * Delete a user and cascade their related data.
 * Enforces:
 *   - confirmEmail must match the target user's email (case-insensitive)
 *   - cannot delete self
 *   - cannot delete the last remaining admin
 */
async function deleteUser(userId, { confirmEmail, actorId } = {}) {
  assertObjectId(userId);

  if (actorId && String(actorId) === String(userId)) {
    throw typedError('SELF_DELETE', 'Cannot delete your own account', 400);
  }

  const user = await User.findById(userId).lean();
  if (!user) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }

  if (!confirmEmail || typeof confirmEmail !== 'string') {
    throw typedError('EMAIL_MISMATCH', 'confirmEmail must match user email', 400);
  }
  if (String(confirmEmail).trim().toLowerCase() !== String(user.email).toLowerCase()) {
    throw typedError('EMAIL_MISMATCH', 'confirmEmail must match user email', 400);
  }

  // Last-admin guard: count *other* admins. Counting all admins (including
  // this user) leaves a TOCTOU race where two concurrent deletions can both
  // pass the check and end with zero admins.
  if (user.role === SystemRoles.ADMIN) {
    const otherAdmins = await User.countDocuments({
      role: SystemRoles.ADMIN,
      _id: { $ne: user._id },
    });
    if (otherAdmins < 1) {
      throw typedError('LAST_ADMIN', 'Cannot delete the last remaining admin', 400);
    }
  }

  const uid = user._id.toString();

  const tasks = [
    Agent && Agent.deleteMany ? Agent.deleteMany({ author: uid }) : null,
    Assistant && Assistant.deleteMany ? Assistant.deleteMany({ user: uid }) : null,
    Balance && Balance.deleteMany ? Balance.deleteMany({ user: uid }) : null,
    ConversationTag && ConversationTag.deleteMany
      ? ConversationTag.deleteMany({ user: uid })
      : null,
    Conversation && Conversation.deleteMany ? Conversation.deleteMany({ user: uid }) : null,
    Message && Message.deleteMany ? Message.deleteMany({ user: uid }) : null,
    File && File.deleteMany ? File.deleteMany({ user: uid }) : null,
    Key && Key.deleteMany ? Key.deleteMany({ userId: uid }) : null,
    MemoryEntry && MemoryEntry.deleteMany ? MemoryEntry.deleteMany({ userId: uid }) : null,
    PluginAuth && PluginAuth.deleteMany ? PluginAuth.deleteMany({ userId: uid }) : null,
    Prompt && Prompt.deleteMany ? Prompt.deleteMany({ author: uid }) : null,
    PromptGroup && PromptGroup.deleteMany ? PromptGroup.deleteMany({ author: uid }) : null,
    Preset && Preset.deleteMany ? Preset.deleteMany({ user: uid }) : null,
    Session && Session.deleteMany ? Session.deleteMany({ user: uid }) : null,
    SharedLink && SharedLink.deleteMany ? SharedLink.deleteMany({ user: uid }) : null,
    ToolCall && ToolCall.deleteMany ? ToolCall.deleteMany({ user: uid }) : null,
    Token && Token.deleteMany ? Token.deleteMany({ userId: uid }) : null,
    Transaction && Transaction.deleteMany ? Transaction.deleteMany({ user: uid }) : null,
    SubscriptionProfile && SubscriptionProfile.deleteMany
      ? SubscriptionProfile.deleteMany({ userId: user._id })
      : null,
  ].filter(Boolean);

  await Promise.all(tasks);
  await User.deleteOne({ _id: user._id });

  // Best-effort: clear ban entries for the user.
  try {
    const banLogs = getLogStores(ViolationTypes.BAN);
    await banLogs.delete(uid);
  } catch (_e) {
    /* ignore */
  }

  return {
    ok: true,
    deletedUserId: uid,
    email: user.email,
  };
}

module.exports = {
  listUsers,
  getUserDetail,
  banUser,
  unbanUser,
  changeUserRole,
  requestPasswordReset,
  inviteUser,
  deleteUser,
  // exposed for tests
  _internal: {
    sanitizeUser,
    escapeRegex,
    SAFE_USER_FIELDS,
    ALLOWED_SORTS,
  },
};
