const crypto = require('node:crypto');
const {
  logger,
  encryptV2,
  decryptV2,
  DEFAULT_REFRESH_TOKEN_EXPIRY,
} = require('@librechat/data-schemas');
const { math } = require('@librechat/api');
const db = require('~/models');

/**
 * Server-side recovery bridge for refresh tokens rotated during SSE streaming.
 *
 * When an OBO call during SSE streaming rotates a refresh token but cannot sync the
 * browser cookie (headers already sent), this bridge stores a temporary Mongo mapping so
 * that if the express-session expires and the next /api/auth/refresh uses the stale
 * cookie, we can look up and use the rotated token instead.
 *
 * Bridge key: hash(oldRefreshToken) uniquely identifies which token rotation this is.
 * Bridge value: encrypted newRefreshToken, userId, tenantId, openidIssuer for verification.
 * Bridge TTL: matches the refresh-token cookie lifetime and is enforced by Mongo TTL.
 */
const getBridgeTtlMs = () => math(process.env.REFRESH_TOKEN_EXPIRY, DEFAULT_REFRESH_TOKEN_EXPIRY);

/**
 * Hashes a refresh token for use as a bridge key. Does NOT encrypt; hash is for
 * lookup only, safe to expose. Uses full SHA-256 because this value is persisted
 * and participates in a unique index.
 *
 * @param {string} refreshToken
 * @returns {string} hex-encoded SHA-256 hash
 */
function hashRefreshToken(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

/**
 * Stores a bridge mapping old (stale) refresh token to new (rotated) token for later
 * recovery. Called only when an inline OBO refresh rotates the token but cannot set
 * the browser cookie (headers already sent, SSE streaming).
 *
 * @param {object} args
 * @param {string} args.oldRefreshToken — the token before IdP refresh
 * @param {string} args.newRefreshToken — the token returned by IdP
 * @param {string} args.userId — user._id (for verification on lookup)
 * @param {string} [args.tenantId] — user.tenantId (for multi-tenant deployments)
 * @param {string} [args.openidIssuer] — user.openidIssuer (for issuer-specific validation)
 * @param {number} [args.ttl] — bridge TTL in ms (defaults to REFRESH_TOKEN_EXPIRY)
 */
async function storeRefreshTokenBridge({
  oldRefreshToken,
  newRefreshToken,
  userId,
  tenantId,
  openidIssuer,
  ttl,
}) {
  if (!oldRefreshToken || !newRefreshToken || !userId) {
    logger.warn('[RefreshTokenBridge] Attempted to store bridge with missing required fields');
    return;
  }

  const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken);
  const bridgeTtl = ttl ?? getBridgeTtlMs();
  const encryptedNewToken = await encryptV2(newRefreshToken);

  await db.upsertRefreshTokenBridge({
    oldRefreshTokenHash,
    encryptedNewRefreshToken: encryptedNewToken,
    userId,
    tenantId,
    openidIssuer,
    expiresAt: new Date(Date.now() + bridgeTtl),
  });

  logger.debug('[RefreshTokenBridge] Stored recovery bridge', {
    tokenHash: oldRefreshTokenHash,
    userId,
    ttl: bridgeTtl,
  });
}

/**
 * Looks up and retrieves a stored bridge, verifying it matches the user context
 * and hasn't expired. Returns the decrypted rotated token on success, null
 * otherwise. Does NOT consume the bridge; callers delete it only after a
 * successful bridged refresh.
 *
 * @param {object} args
 * @param {string} args.oldRefreshToken — the token to look up (hashed for key)
 * @param {string} args.userId — current user._id (must match the bridged context)
 * @param {string} [args.tenantId] — current user.tenantId (optional but verified if present)
 * @param {string} [args.openidIssuer] — current user.openidIssuer (optional but verified if present)
 * @returns {Promise<string | null>} the rotated refresh token if found and valid, null otherwise
 */
async function getRefreshTokenBridge({ oldRefreshToken, userId, tenantId, openidIssuer }) {
  if (!oldRefreshToken || !userId) {
    return null;
  }

  const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken);
  const bridge = await db.findRefreshTokenBridge({
    oldRefreshTokenHash,
    userId,
    tenantId,
  });

  if (!bridge) {
    return null;
  }

  if (bridge.openidIssuer && bridge.openidIssuer !== openidIssuer) {
    logger.warn('[RefreshTokenBridge] Bridge lookup failed: issuer mismatch', {
      tokenHash: oldRefreshTokenHash,
    });
    return null;
  }

  const age = Date.now() - new Date(bridge.createdAt).getTime();
  logger.info('[RefreshTokenBridge] Successfully resolved recovery bridge', {
    tokenHash: oldRefreshTokenHash,
    userId,
    age,
  });

  return decryptV2(bridge.encryptedNewRefreshToken);
}

/**
 * Deletes a bridge after the bridged refresh has succeeded.
 *
 * @param {object} args
 * @param {string} args.oldRefreshToken
 * @returns {Promise<boolean>}
 */
async function deleteRefreshTokenBridge({ oldRefreshToken, userId, tenantId }) {
  if (!oldRefreshToken) {
    return false;
  }
  if (!userId) {
    return false;
  }
  const oldRefreshTokenHash = hashRefreshToken(oldRefreshToken);
  const result = await db.deleteRefreshTokenBridge({ oldRefreshTokenHash, userId, tenantId });
  return (result.deletedCount ?? 0) > 0;
}

module.exports = {
  storeRefreshTokenBridge,
  getRefreshTokenBridge,
  deleteRefreshTokenBridge,
  __internals: {
    hashRefreshToken,
    getBridgeTtlMs,
  },
};
