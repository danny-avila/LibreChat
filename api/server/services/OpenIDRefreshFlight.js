const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { logger, encryptV2, decryptV2 } = require('@librechat/data-schemas');
const db = require('~/models');

const DEFAULT_FLIGHT_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 30 * 1000;
const DEFAULT_WAIT_TIMEOUT_MS = DEFAULT_LOCK_TTL_MS + 1000;
const DEFAULT_WAIT_INTERVAL_MS = 100;
const INTERNAL_BROWSER_REFRESH_TOKEN_FIELD = '__browserRefreshToken';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getUserSub(req, user) {
  return (
    user?.openidId ||
    user?.id ||
    user?._id?.toString?.() ||
    req?.user?.openidId ||
    req?.user?.id ||
    req?.user?._id?.toString?.()
  );
}

function createOpenIDRefreshFlightKey({ req, user, refreshToken }) {
  const sub = getUserSub(req, user);
  if (!sub || !refreshToken) {
    return null;
  }

  const parts = [
    user?.tenantId ?? req?.user?.tenantId ?? 'no-tenant',
    user?.openidIssuer ?? req?.user?.openidIssuer ?? 'no-issuer',
    sub,
    req?.sessionID ?? 'no-session',
    sha256(refreshToken),
  ];
  return sha256(parts.join('\x1f'));
}

async function acquireOpenIDRefreshFlight({
  key,
  ownerId = crypto.randomUUID(),
  ttl = DEFAULT_FLIGHT_TTL_MS,
  lockTtl = DEFAULT_LOCK_TTL_MS,
}) {
  if (!key) {
    return { acquired: true, key: null, ownerId, flight: null };
  }

  const acquired = await db.acquireOpenIDRefreshFlight({
    key,
    ownerId,
    lockExpiresAt: new Date(Date.now() + lockTtl),
    expiresAt: new Date(Date.now() + ttl),
  });

  return {
    ...acquired,
    key,
    ownerId,
  };
}

async function completeOpenIDRefreshFlight({ key, ownerId, tokens, ttl = DEFAULT_FLIGHT_TTL_MS }) {
  if (!key || !ownerId || !tokens) {
    return null;
  }

  const serializedTokens = { ...tokens };
  const browserRefreshToken = tokens[INTERNAL_BROWSER_REFRESH_TOKEN_FIELD];
  if (typeof browserRefreshToken === 'string' && browserRefreshToken) {
    // The marker is non-enumerable in memory; re-add it enumerably so JSON.stringify preserves it.
    serializedTokens[INTERNAL_BROWSER_REFRESH_TOKEN_FIELD] = browserRefreshToken;
  }
  const encryptedResult = await encryptV2(JSON.stringify(serializedTokens));
  return db.completeOpenIDRefreshFlight({
    key,
    ownerId,
    encryptedResult,
    expiresAt: new Date(Date.now() + ttl),
  });
}

async function failOpenIDRefreshFlight({ key, ownerId, error, ttl = DEFAULT_FLIGHT_TTL_MS }) {
  if (!key || !ownerId) {
    return null;
  }

  const errorMessage =
    typeof error?.message === 'string' && error.message ? error.message : 'OpenID refresh failed';

  return db.failOpenIDRefreshFlight({
    key,
    ownerId,
    errorMessage,
    expiresAt: new Date(Date.now() + ttl),
  });
}

async function readCompletedFlight(flight) {
  if (!flight) {
    return null;
  }

  if (flight.status === 'failed') {
    throw new Error(flight.errorMessage || 'OpenID refresh failed in another worker');
  }

  if (flight.status !== 'completed' || !flight.encryptedResult) {
    return null;
  }

  const decrypted = await decryptV2(flight.encryptedResult);
  const tokens = JSON.parse(decrypted);
  const browserRefreshToken = tokens?.[INTERNAL_BROWSER_REFRESH_TOKEN_FIELD];
  if (typeof browserRefreshToken === 'string' && browserRefreshToken) {
    delete tokens[INTERNAL_BROWSER_REFRESH_TOKEN_FIELD];
    Object.defineProperty(tokens, INTERNAL_BROWSER_REFRESH_TOKEN_FIELD, {
      value: browserRefreshToken,
      enumerable: false,
      configurable: true,
    });
  }
  return tokens;
}

async function waitForOpenIDRefreshFlight({
  key,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
  intervalMs = DEFAULT_WAIT_INTERVAL_MS,
}) {
  if (!key) {
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const flight = await db.findOpenIDRefreshFlight({ key });
    const completed = await readCompletedFlight(flight);
    if (completed) {
      return completed;
    }
    if (!flight) {
      return null;
    }
    await delay(intervalMs);
  }

  logger.warn('[OpenIDRefreshFlight] Timed out waiting for refresh flight', { key });
  return null;
}

module.exports = {
  acquireOpenIDRefreshFlight,
  completeOpenIDRefreshFlight,
  createOpenIDRefreshFlightKey,
  failOpenIDRefreshFlight,
  waitForOpenIDRefreshFlight,
  __internals: {
    sha256,
    readCompletedFlight,
    DEFAULT_FLIGHT_TTL_MS,
    DEFAULT_LOCK_TTL_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_INTERVAL_MS,
  },
};
