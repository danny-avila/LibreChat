const crypto = require('crypto');

const SCOPE = 'admin';

function getDefaultTtlSec() {
  const parsed = parseInt(process.env.ADMIN_FRESH_AUTH_TTL_SEC || '300', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 300;
  return parsed;
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
    // Fail closed: an empty HMAC key would let any forged token verify.
    // JWT_SECRET is already required for normal auth, so this should never
    // fire in a healthy deployment.
    throw new Error('JWT_SECRET must be set to issue or verify admin fresh-auth tokens');
  }
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

function timingSafeEqualBufs(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Issue a fresh-auth token bound to a userId and scope.
 * Token format: `${base64url(payload)}.${base64url(signature)}`
 * where payload = `${userId}.${expiresAtUnixMs}.${scope}` and
 * signature = HMAC-SHA256(payload, JWT_SECRET).
 */
function issueFreshAuthToken(userId, scope = SCOPE, ttlSec = getDefaultTtlSec()) {
  if (!userId) throw new Error('issueFreshAuthToken requires userId');
  const expiresAt = Date.now() + ttlSec * 1000;
  const payload = `${userId}.${expiresAt}.${scope}`;
  const sig = sign(payload);
  const token = `${base64urlEncode(payload)}.${base64urlEncode(sig)}`;
  return { token, expiresAt };
}

function reject(res) {
  return res
    .status(401)
    .json({ message: 'Fresh authentication required', code: 'FRESH_AUTH_REQUIRED' });
}

function requireFreshAuth(req, res, next) {
  try {
    const headerVal = req.headers?.['x-fresh-auth-token'];
    if (!headerVal || typeof headerVal !== 'string') {
      return reject(res);
    }

    const dotIdx = headerVal.indexOf('.');
    if (dotIdx <= 0 || dotIdx === headerVal.length - 1) {
      return reject(res);
    }

    const payloadB64 = headerVal.slice(0, dotIdx);
    const sigB64 = headerVal.slice(dotIdx + 1);

    let payload;
    let providedSig;
    try {
      payload = base64urlDecodeToString(payloadB64);
      providedSig = base64urlDecodeToBuffer(sigB64);
    } catch (_e) {
      return reject(res);
    }
    if (!payload || providedSig.length === 0) {
      return reject(res);
    }

    const expectedSig = sign(payload);
    if (!timingSafeEqualBufs(providedSig, expectedSig)) {
      return reject(res);
    }

    const parts = payload.split('.');
    if (parts.length !== 3) return reject(res);
    const [userId, expiresAtStr, scope] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return reject(res);
    }
    if (scope !== SCOPE) {
      return reject(res);
    }

    const reqUserId = req.user?.id || req.user?._id?.toString();
    if (!reqUserId || userId !== reqUserId) {
      return reject(res);
    }

    return next();
  } catch (_err) {
    return reject(res);
  }
}

module.exports = requireFreshAuth;
module.exports.issueFreshAuthToken = issueFreshAuthToken;
module.exports.requireFreshAuth = requireFreshAuth;
module.exports._SCOPE = SCOPE;
