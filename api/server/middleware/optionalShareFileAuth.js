const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const {
  isEnabled,
  clearCloudFrontCookies,
  isTokenRetired,
  isTwoFactorEnrollmentRequired,
} = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { getUserById, findSession } = require('~/models');

/** Keeps the `iat` alongside the id, so the enrollment cutoff can date the credential */
const verifySignedUser = (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    return typeof payload?.id === 'string' ? { userId: payload.id, issuedAt: payload.iat } : null;
  } catch {
    return null;
  }
};

const getRefreshTokenUser = async (token) => {
  const verified = verifySignedUser(token);
  if (!verified) {
    return null;
  }

  const session = await runAsSystem(() =>
    findSession({ userId: verified.userId, refreshToken: token }),
  );
  return session ? verified : null;
};

const getOpenIdUser = (parsed, req) => {
  if (parsed.token_provider !== 'openid' || !isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return null;
  }

  const sessionRefreshToken = req.session?.openidTokens?.refreshToken;
  if (!parsed.refreshToken || parsed.refreshToken !== sessionRefreshToken) {
    return null;
  }

  return verifySignedUser(parsed.openid_user_id);
};

const clearCloudFrontCookiesForUser = (res, user) => {
  clearCloudFrontCookies(res, {
    userId: user.id?.toString?.() ?? user._id?.toString?.(),
    tenantId: user.tenantId ?? user.orgId,
    storageRegion: user.storageRegion,
  });
};

const clearUserWhenEnrollmentIsRequired = (req, res) => {
  if (!isTwoFactorEnrollmentRequired(req.user)) {
    return false;
  }

  clearCloudFrontCookiesForUser(res, req.user);
  delete req.user;
  delete req.authStrategy;
  return true;
};

/**
 * Fallback auth for share file routes that are hit by `<img>`/anchor requests,
 * which can't carry the bearer access token. Resolves the viewer from the
 * `refreshToken` cookie (or an active OpenID session plus signed `openid_user_id`
 * cookie) so non-public shared links can authorize the viewer's ACL. Never
 * blocks: on any failure it leaves `req.user` unset and lets
 * `canAccessSharedLink` decide (public access, 401, or 403).
 */
const optionalShareFileAuth = async (req, res, next) => {
  if (req.user) {
    clearUserWhenEnrollmentIsRequired(req, res);
    return next();
  }

  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return next();
    }

    const parsed = cookie.parse(cookieHeader);
    const verified =
      getOpenIdUser(parsed, req) ||
      (parsed.refreshToken ? await getRefreshTokenUser(parsed.refreshToken) : null);
    if (!verified) {
      return next();
    }

    // Resolve in system context: this runs before canAccessSharedLink establishes
    // the share tenant, so under strict tenant isolation a tenant-scoped User
    // query would otherwise throw. The viewer's id comes from verified, active
    // cookie auth; the share's tenant-scoped ACL check still gates access.
    const user = await runAsSystem(() =>
      getUserById(verified.userId, '-password -__v -totpSecret -backupCodes'),
    );
    if (!user) {
      return next();
    }

    /**
     * The cutoff matters here as much as the enrollment check: a session that outlived
     * finalization still resolves, and every other authenticated path already refuses the
     * credential it was minted from.
     */
    if (isTwoFactorEnrollmentRequired(user) || isTokenRetired(verified.issuedAt, user)) {
      clearCloudFrontCookiesForUser(res, user);
      return next();
    }

    user.id = user._id.toString();
    if (!user.role) {
      user.role = SystemRoles.USER;
    }
    req.user = user;
  } catch (error) {
    logger.warn('[optionalShareFileAuth] cookie auth failed:', error?.message);
  }

  return next();
};

module.exports = optionalShareFileAuth;
