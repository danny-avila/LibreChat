const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const {
  isEnabled,
  getBasePath,
  isTwoFactorEnrollmentRequired,
  isTokenIssuedBeforeTwoFactorEnrollment,
} = require('@librechat/api');
const { getUserById } = require('~/models');

const OBJECT_ID_LENGTH = 24;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Validates if a string is a valid MongoDB ObjectId
 * @param {string} id - String to validate
 * @returns {boolean} - Whether string is a valid ObjectId format
 */
function isValidObjectId(id) {
  if (typeof id !== 'string') {
    return false;
  }
  if (id.length !== OBJECT_ID_LENGTH) {
    return false;
  }
  return OBJECT_ID_PATTERN.test(id);
}

/**
 * Validates a LibreChat refresh token
 * @param {string} refreshToken - The refresh token to validate
 * @returns {{valid: boolean, userId?: string, issuedAt?: number, error?: string}} - Validation result
 */
function validateToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (!isValidObjectId(payload.id)) {
      return { valid: false, error: 'Invalid User ID' };
    }

    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < currentTimeInSeconds) {
      return { valid: false, error: 'Refresh token expired' };
    }

    return { valid: true, userId: payload.id, issuedAt: payload.iat };
  } catch (err) {
    logger.warn('[validateToken]', err);
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Applies the two-factor gates that `requireJwtAuth` and the refresh endpoint already enforce.
 *
 * This route authenticates from the cookie alone, so without these checks a credential minted
 * before enrollment keeps reading images after enrollment has retired it everywhere else, and an
 * account still owing required enrollment keeps reading them throughout.
 * @param {string} userId - The user named by the presented token
 * @param {number} [issuedAtSeconds] - The token's `iat` claim
 * @returns {Promise<string|null>} - Reason to deny, or null when the request may proceed
 */
async function getTwoFactorDenialReason(userId, issuedAtSeconds) {
  const user = await getUserById(userId, 'provider twoFactorEnabled twoFactorEnrolledAt');
  if (!user) {
    return 'No user found';
  }

  if (isTokenIssuedBeforeTwoFactorEnrollment(issuedAtSeconds, user.twoFactorEnrolledAt)) {
    return 'Token predates two-factor enrollment';
  }

  if (isTwoFactorEnrollmentRequired(user)) {
    return 'Two-factor enrollment required';
  }

  return null;
}

/**
 * Factory to create the `validateImageRequest` middleware with configured secureImageLinks
 * @param {boolean} [secureImageLinks] - Whether secure image links are enabled
 */
function createValidateImageRequest(secureImageLinks) {
  if (!secureImageLinks) {
    return (_req, _res, next) => next();
  }
  /**
   * Middleware to validate image request.
   * Supports both LibreChat refresh tokens and OpenID JWT tokens.
   * Must be set by `secureImageLinks` via custom config file.
   */
  return async function validateImageRequest(req, res, next) {
    try {
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) {
        logger.warn('[validateImageRequest] No cookies provided');
        return res.status(401).send('Unauthorized');
      }

      const parsedCookies = cookies.parse(cookieHeader);
      const tokenProvider = parsedCookies.token_provider;
      let userIdForPath;
      let issuedAtSeconds;

      if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
        /** For OpenID users with OPENID_REUSE_TOKENS, use openid_user_id cookie */
        const openidUserId = parsedCookies.openid_user_id;
        if (!openidUserId) {
          logger.warn('[validateImageRequest] No OpenID user ID cookie found');
          return res.status(403).send('Access Denied');
        }

        const validationResult = validateToken(openidUserId);
        if (!validationResult.valid) {
          logger.warn(`[validateImageRequest] ${validationResult.error}`);
          return res.status(403).send('Access Denied');
        }
        userIdForPath = validationResult.userId;
        issuedAtSeconds = validationResult.issuedAt;
      } else {
        /**
         * For non-OpenID users (or OpenID without REUSE_TOKENS), use refreshToken from cookies.
         * These users authenticate via setAuthTokens() which stores refreshToken in cookies.
         */
        const refreshToken = parsedCookies.refreshToken;

        if (!refreshToken) {
          logger.warn('[validateImageRequest] Token not provided');
          return res.status(401).send('Unauthorized');
        }

        const validationResult = validateToken(refreshToken);
        if (!validationResult.valid) {
          logger.warn(`[validateImageRequest] ${validationResult.error}`);
          return res.status(403).send('Access Denied');
        }
        userIdForPath = validationResult.userId;
        issuedAtSeconds = validationResult.issuedAt;
      }

      if (!userIdForPath) {
        logger.warn('[validateImageRequest] No user ID available for path validation');
        return res.status(403).send('Access Denied');
      }

      const MAX_URL_LENGTH = 2048;
      if (req.originalUrl.length > MAX_URL_LENGTH) {
        logger.warn('[validateImageRequest] URL too long');
        return res.status(403).send('Access Denied');
      }

      if (req.originalUrl.includes('\x00')) {
        logger.warn('[validateImageRequest] URL contains null byte');
        return res.status(403).send('Access Denied');
      }

      let fullPath;
      try {
        fullPath = decodeURIComponent(req.originalUrl);
      } catch {
        logger.warn('[validateImageRequest] Invalid URL encoding');
        return res.status(403).send('Access Denied');
      }

      const basePath = getBasePath();
      const imagesPath = `${basePath}/images`;

      const agentAvatarPattern = new RegExp(
        `^${imagesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[a-f0-9]{24}/agent-[^/]*$`,
      );
      const escapedUserId = userIdForPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pathPattern = new RegExp(
        `^${imagesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${escapedUserId}/[^/]+$`,
      );

      if (!agentAvatarPattern.test(fullPath) && !pathPattern.test(fullPath)) {
        logger.warn('[validateImageRequest] Invalid image path');
        return res.status(403).send('Access Denied');
      }

      /** Read last, so a request rejected on its path never reaches the database */
      const denialReason = await getTwoFactorDenialReason(userIdForPath, issuedAtSeconds);
      if (denialReason) {
        logger.warn(`[validateImageRequest] ${denialReason}`);
        return res.status(403).send('Access Denied');
      }

      logger.debug('[validateImageRequest] Image request validated');
      next();
    } catch (error) {
      logger.error('[validateImageRequest] Error:', error);
      res.status(500).send('Internal Server Error');
    }
  };
}

module.exports = createValidateImageRequest;
