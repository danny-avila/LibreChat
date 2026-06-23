const crypto = require('node:crypto');
const { logger, encryptV2, decryptV2 } = require('@librechat/data-schemas');

/**
 * Ephemeral server-side recovery bridge for refresh tokens rotated during SSE streaming.
 *
 * When an OBO call during SSE streaming rotates a refresh token but cannot sync the
 * browser cookie (headers already sent), this bridge stores a temporary mapping so
 * that if the express-session expires and the next /api/auth/refresh uses the stale
 * cookie, we can look up and use the rotated token instead.
 *
 * Bridge key: hash(oldRefreshToken) uniquely identifies which token rotation this is.
 * Bridge value: encrypted newRefreshToken, userId, tenantId, openidIssuer for verification.
 * Bridge TTL: short-lived (default ~max cookie expiry window), auto-deleted on use or expiry.
 *
 * Process-local: each server instance maintains its own bridge map. Multi-worker deployments
 * may have race conditions on cleanup, but the TTL ensures bridges don't accumulate.
 */
// hash(oldToken) -> { encryptedNewToken, userId, tenantId, issuer, createdAt, ttl }
const bridges = new Map();

/**
 * TTL for a refresh-token bridge (ms). Bridges should be short-lived to bound memory
 * and avoid stale recovery attempts. Defaults to 24 hours (similar to refresh cookie).
 */
const DEFAULT_BRIDGE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Hashes a refresh token for use as a bridge key. Does NOT encrypt; hash is for
 * lookup only, safe to expose. Uses SHA-256 truncated to 12 bytes for reasonable
 * collision safety (~ 48 bits entropy, same as single-flight key hashing).
 *
 * @param {string} refreshToken
 * @returns {string} hex-encoded 12-byte hash
 */
function hashRefreshToken(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex').slice(0, 24);
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
 * @param {number} [args.ttl] — bridge TTL in ms (defaults to DEFAULT_BRIDGE_TTL_MS)
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

  purgeExpiredBridges();

  const key = hashRefreshToken(oldRefreshToken);
  const bridgeTtl = ttl ?? DEFAULT_BRIDGE_TTL_MS;
  const encryptedNewToken = await encryptV2(newRefreshToken);

  bridges.set(key, {
    encryptedNewToken,
    userId,
    tenantId,
    issuer: openidIssuer,
    createdAt: Date.now(),
    ttl: bridgeTtl,
  });

  logger.debug('[RefreshTokenBridge] Stored recovery bridge', {
    tokenHash: key,
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

  const key = hashRefreshToken(oldRefreshToken);
  const bridge = bridges.get(key);

  if (!bridge) {
    return null;
  }

  // Check TTL: if expired, delete and return null
  const age = Date.now() - bridge.createdAt;
  if (age > bridge.ttl) {
    logger.debug('[RefreshTokenBridge] Bridge expired, deleting', { tokenHash: key, age });
    bridges.delete(key);
    return null;
  }

  // Verify user context matches. Optional tenant/issuer constraints are enforced when stored.
  if (bridge.userId !== userId) {
    logger.warn('[RefreshTokenBridge] Bridge lookup failed: userId mismatch', {
      tokenHash: key,
      bridgedUserId: bridge.userId,
      currentUserId: userId,
    });
    return null;
  }

  if (bridge.tenantId && bridge.tenantId !== tenantId) {
    logger.warn('[RefreshTokenBridge] Bridge lookup failed: tenantId mismatch', {
      tokenHash: key,
    });
    return null;
  }

  if (bridge.issuer && bridge.issuer !== openidIssuer) {
    logger.warn('[RefreshTokenBridge] Bridge lookup failed: issuer mismatch', {
      tokenHash: key,
    });
    return null;
  }

  logger.info('[RefreshTokenBridge] Successfully resolved recovery bridge', {
    tokenHash: key,
    userId,
    age,
  });

  return decryptV2(bridge.encryptedNewToken);
}

/**
 * Deletes a bridge after the bridged refresh has succeeded.
 *
 * @param {object} args
 * @param {string} args.oldRefreshToken
 * @returns {boolean}
 */
function deleteRefreshTokenBridge({ oldRefreshToken }) {
  if (!oldRefreshToken) {
    return false;
  }
  return bridges.delete(hashRefreshToken(oldRefreshToken));
}

/**
 * Cleanup routine: purge expired bridges. Safe to call periodically (e.g., hourly).
 * Logs the count of bridges cleaned up.
 */
function purgeExpiredBridges() {
  const now = Date.now();
  let purged = 0;

  for (const [key, bridge] of bridges.entries()) {
    const age = now - bridge.createdAt;
    if (age > bridge.ttl) {
      bridges.delete(key);
      purged++;
    }
  }

  if (purged > 0) {
    logger.debug('[RefreshTokenBridge] Purged expired bridges', {
      count: purged,
      remaining: bridges.size,
    });
  }
}

module.exports = {
  storeRefreshTokenBridge,
  getRefreshTokenBridge,
  deleteRefreshTokenBridge,
  purgeExpiredBridges,
  __internals: {
    bridges,
    hashRefreshToken,
    DEFAULT_BRIDGE_TTL_MS,
  },
};
