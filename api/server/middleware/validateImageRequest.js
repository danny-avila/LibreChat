const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const {
  logger,
  ResourceCapabilityMap,
  getTenantId,
  runAsSystem,
  tenantStorage,
} = require('@librechat/data-schemas');
const { isEnabled, getBasePath } = require('@librechat/api');
const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { checkPermission } = require('~/server/services/PermissionService');
const { findSession, getAgent, getUserById } = require('~/models');

const OBJECT_ID_LENGTH = 24;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const AGENT_AVATAR_PATTERN = /^agent-(.+)-avatar-\d+\.[^/]+$/;

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
 * @returns {{valid: boolean, userId?: string, error?: string}} - Validation result
 */
async function validateToken(refreshToken, requireActiveSession = true) {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (!isValidObjectId(payload.id)) {
      return { valid: false, error: 'Invalid User ID' };
    }

    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < currentTimeInSeconds) {
      return { valid: false, error: 'Refresh token expired' };
    }

    if (!requireActiveSession) {
      return { valid: true, userId: payload.id };
    }
    const session = await runAsSystem(() => findSession({ userId: payload.id, refreshToken }));
    return session
      ? { valid: true, userId: payload.id }
      : { valid: false, error: 'Inactive session' };
  } catch (err) {
    logger.warn('[validateToken]', err);
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Factory to create the `validateImageRequest` middleware with configured secureImageLinks
 * @param {boolean} [secureImageLinks] - Whether secure image links are enabled
 */
function createValidateImageRequest(secureImageLinks = true) {
  if (!secureImageLinks) {
    return (_req, _res, next) => next();
  }
  /**
   * Middleware to validate image request.
   * Supports both LibreChat refresh tokens and OpenID JWT tokens.
   * Image links are protected by default. `secureImageLinks: false` is an explicit legacy opt-out.
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

      if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
        /** For OpenID users with OPENID_REUSE_TOKENS, use openid_user_id cookie */
        const openidUserId = parsedCookies.openid_user_id;
        if (!openidUserId) {
          logger.warn('[validateImageRequest] No OpenID user ID cookie found');
          return res.status(403).send('Access Denied');
        }
        if (parsedCookies.refreshToken !== req.session?.openidTokens?.refreshToken) {
          logger.warn('[validateImageRequest] Inactive OpenID session');
          return res.status(403).send('Access Denied');
        }

        const validationResult = await validateToken(openidUserId, false);
        if (!validationResult.valid) {
          logger.warn(`[validateImageRequest] ${validationResult.error}`);
          return res.status(403).send('Access Denied');
        }
        userIdForPath = validationResult.userId;
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

        const validationResult = await validateToken(refreshToken);
        if (!validationResult.valid) {
          logger.warn(`[validateImageRequest] ${validationResult.error}`);
          return res.status(403).send('Access Denied');
        }
        userIdForPath = validationResult.userId;
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

      const escapedUserId = userIdForPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pathPattern = new RegExp(
        `^${imagesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${escapedUserId}/[^/]+$`,
      );

      if (pathPattern.test(fullPath)) {
        logger.debug('[validateImageRequest] Image request validated');
        return next();
      }

      const imagePath = fullPath.split(/[?#]/, 1)[0];
      const agentAvatarMatch = imagePath.match(
        new RegExp(`^${imagesPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[a-f0-9]{24}/([^/]+)$`),
      );
      const agentId = agentAvatarMatch?.[1].match(AGENT_AVATAR_PATTERN)?.[1];
      if (!agentId) {
        logger.warn('[validateImageRequest] Invalid image path');
        return res.status(403).send('Access Denied');
      }

      const user = await runAsSystem(() => getUserById(userIdForPath, 'role tenantId'));
      if (!user) {
        logger.warn('[validateImageRequest] User not found for avatar request');
        return res.status(403).send('Access Denied');
      }
      const authorizeAvatar = async () => {
        const agent = await getAgent({ id: agentId });
        if (!agent) {
          return false;
        }
        let managesAgents = false;
        try {
          managesAgents = await hasCapability(
            { id: userIdForPath, role: user.role },
            ResourceCapabilityMap[ResourceType.AGENT],
          );
        } catch (error) {
          logger.warn('[validateImageRequest] Agent capability check failed', error);
        }
        return (
          managesAgents ||
          (await checkPermission({
            userId: userIdForPath,
            role: user.role,
            resourceType: ResourceType.AGENT,
            resourceId: agent._id,
            requiredPermission: PermissionBits.VIEW,
          }))
        );
      };
      const canViewAgent =
        user.tenantId && getTenantId() == null
          ? await tenantStorage.run(
              { tenantId: user.tenantId, userId: userIdForPath },
              authorizeAvatar,
            )
          : await authorizeAvatar();
      if (!canViewAgent) {
        logger.warn('[validateImageRequest] User lacks agent avatar access');
        return res.status(403).send('Access Denied');
      }

      logger.debug('[validateImageRequest] Agent avatar request validated');
      return next();
    } catch (error) {
      logger.error('[validateImageRequest] Error:', error);
      res.status(500).send('Internal Server Error');
    }
  };
}

module.exports = createValidateImageRequest;
