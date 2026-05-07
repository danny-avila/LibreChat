const crypto = require('crypto');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles, ViolationTypes } = require('librechat-data-provider');
const { User, ImpersonationToken } = require('~/db/models');
const getLogStores = require('~/cache/getLogStores');

const SCOPE = 'admin-impersonate';
const DEFAULT_TTL_SEC = 300;

function typedError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function assertObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw typedError('INVALID_USER_ID', 'Invalid user id', 400);
  }
}

function ttlMs() {
  const parsed = parseInt(process.env.ADMIN_IMPERSONATE_TTL_SEC || `${DEFAULT_TTL_SEC}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SEC * 1000;
  return parsed * 1000;
}

function base64urlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64urlDecodeToString(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function base64urlDecodeToBuffer(input) {
  return Buffer.from(input, 'base64url');
}

function sign(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set to issue or verify impersonation tokens');
  }
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

function timingSafeEqualBufs(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildToken({ jti, actorId, targetUserId, expiresAt }) {
  const payload = JSON.stringify({
    jti,
    actorId: String(actorId),
    targetUserId: String(targetUserId),
    expiresAt,
    scope: SCOPE,
  });
  const sig = sign(payload);
  return `${base64urlEncode(payload)}.${base64urlEncode(sig)}`;
}

function parseToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }
  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);

  let payloadStr;
  let providedSig;
  try {
    payloadStr = base64urlDecodeToString(payloadB64);
    providedSig = base64urlDecodeToBuffer(sigB64);
  } catch (_e) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }
  if (!payloadStr || providedSig.length === 0) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }

  const expectedSig = sign(payloadStr);
  if (!timingSafeEqualBufs(providedSig, expectedSig)) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }

  let parsed;
  try {
    parsed = JSON.parse(payloadStr);
  } catch (_e) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }

  if (parsed?.scope !== SCOPE) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }
  if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
    throw typedError('TOKEN_EXPIRED', 'Impersonation token expired', 400);
  }
  if (!parsed.jti || !parsed.actorId || !parsed.targetUserId) {
    throw typedError('INVALID_TOKEN', 'Invalid impersonation token', 400);
  }
  return parsed;
}

/**
 * Issue a one-shot impersonation token. The caller (admin) must have already
 * passed fresh-auth at the route layer. Refuses to impersonate self, banned
 * users, or other admins.
 */
async function issueImpersonationToken({ targetUserId, actor, reason }) {
  assertObjectId(targetUserId);

  if (!reason || typeof reason !== 'string') {
    throw typedError('REASON_REQUIRED', 'reason is required', 400);
  }
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 1 || trimmedReason.length > 500) {
    throw typedError('REASON_LENGTH', 'reason must be 1..500 chars', 400);
  }

  const actorId = actor?._id || actor?.id;
  if (!actorId) {
    throw typedError('UNAUTHORIZED', 'Missing actor', 401);
  }
  if (String(actorId) === String(targetUserId)) {
    throw typedError('SELF_IMPERSONATE', 'Cannot impersonate yourself', 400);
  }

  const target = await User.findById(targetUserId).lean();
  if (!target) {
    throw typedError('USER_NOT_FOUND', 'User not found', 404);
  }
  if (target.role === SystemRoles.ADMIN) {
    throw typedError('ADMIN_TARGET', 'Cannot impersonate another admin', 400);
  }

  // Block impersonating banned users — would let admin bypass the ban they imposed.
  try {
    const banLogs = getLogStores(ViolationTypes.BAN);
    const existing = await banLogs.get(String(target._id));
    if (existing) {
      throw typedError('USER_BANNED', 'Cannot impersonate a banned user', 400);
    }
  } catch (err) {
    // Surface our own typed error; cache failures are non-fatal — proceed.
    if (err && err.code === 'USER_BANNED') throw err;
  }

  const jti = crypto.randomUUID();
  const expiresAt = Date.now() + ttlMs();

  await ImpersonationToken.create({
    jti,
    actorId: actor._id || actor.id,
    actorEmail: actor.email || '',
    targetUserId: target._id,
    targetEmail: target.email || '',
    reason: trimmedReason,
    expiresAt: new Date(expiresAt),
  });

  const token = buildToken({
    jti,
    actorId: actor._id || actor.id,
    targetUserId: target._id,
    expiresAt,
  });

  return {
    token,
    url: `/login/impersonate?token=${encodeURIComponent(token)}`,
    expiresAt,
    targetUserId: String(target._id),
    targetEmail: target.email,
    reason: trimmedReason,
  };
}

/**
 * Atomically consume an impersonation token. Returns the target user record
 * and metadata for audit. Refuses if already consumed, expired, or invalid.
 */
async function consumeImpersonationToken({ token, ip, userAgent }) {
  const parsed = parseToken(token);

  // Atomic compare-and-swap: only succeeds if not yet consumed.
  const updated = await ImpersonationToken.findOneAndUpdate(
    { jti: parsed.jti, consumedAt: null, expiresAt: { $gt: new Date() } },
    {
      $set: {
        consumedAt: new Date(),
        consumedFromIp: ip || null,
        consumedFromUserAgent: userAgent || null,
      },
    },
    { new: false },
  ).lean();

  if (!updated) {
    // Either jti unknown, already consumed, or expired between sign and CAS.
    throw typedError(
      'TOKEN_USED_OR_EXPIRED',
      'Impersonation token is invalid or already used',
      400,
    );
  }

  if (String(updated.actorId) !== parsed.actorId) {
    // Token claims mismatch what was stored — defensive; shouldn't happen.
    throw typedError('TOKEN_MISMATCH', 'Impersonation token does not match record', 400);
  }
  if (String(updated.targetUserId) !== parsed.targetUserId) {
    throw typedError('TOKEN_MISMATCH', 'Impersonation token does not match record', 400);
  }

  const target = await User.findById(updated.targetUserId).lean();
  if (!target) {
    throw typedError('USER_NOT_FOUND', 'Target user no longer exists', 404);
  }

  // Re-verify ban at consume time too — admin should not impersonate a user
  // who was banned between issue and consume.
  try {
    const banLogs = getLogStores(ViolationTypes.BAN);
    const existing = await banLogs.get(String(target._id));
    if (existing) {
      throw typedError('USER_BANNED', 'Target user is banned', 400);
    }
  } catch (err) {
    if (err && err.code === 'USER_BANNED') throw err;
  }

  if (target.role === SystemRoles.ADMIN) {
    throw typedError('ADMIN_TARGET', 'Target is an admin', 400);
  }

  return {
    target,
    record: {
      jti: updated.jti,
      actorId: String(updated.actorId),
      actorEmail: updated.actorEmail,
      targetUserId: String(updated.targetUserId),
      targetEmail: updated.targetEmail,
      reason: updated.reason,
    },
  };
}

module.exports = {
  issueImpersonationToken,
  consumeImpersonationToken,
  // Internal — exported for tests.
  _internal: { buildToken, parseToken, sign, ttlMs },
};
// silence unused import in environments that strip dead code
if (logger.silly) logger.silly('[admin/impersonate] loaded');
