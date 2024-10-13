const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const { logger } = require('~/config');
const requireJwtAuth = require('./requireJwtAuth');
const { isOpenIDConfigured } = require('~/strategies/validators');

/**
 * Middleware to validate image request.
 * Must be set by `secureImageLinks` via custom config file.
 */
function validateImageRequest(req, res, next) {
  if (!req.app.locals.secureImageLinks) {
    return next();
  }

  if (isOpenIDConfigured()) {
    requireJwtAuth(req, res, (err) => {
      if (err) {
        logger.warn('[validateImageRequest] Invalid or missing access token', err);
        return res.status(401).send('Unauthorized');
      }

      const userId = req.user?.sub || req.user?.id;
      if (!userId) {
        logger.warn('[validateImageRequest] User ID missing in token');
        return res.status(403).send('Access Denied');
      }

      const fullPath = decodeURIComponent(req.originalUrl);
      const pathPattern = new RegExp(`^/images/${userId}/[^/]+$`);

      if (pathPattern.test(fullPath)) {
        logger.debug('[validateImageRequest] Image request validated');
        next();
      } else {
        logger.warn('[validateImageRequest] Invalid image path');
        res.status(403).send('Access Denied');
      }
    });
  } else {
    const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
    if (!refreshToken) {
      logger.warn('[validateImageRequest] Refresh token not provided');
      return res.status(401).send('Unauthorized');
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      logger.warn('[validateImageRequest]', err);
      return res.status(403).send('Access Denied');
    }

    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < currentTimeInSeconds) {
      logger.warn('[validateImageRequest] Refresh token expired');
      return res.status(403).send('Access Denied');
    }

    const fullPath = decodeURIComponent(req.originalUrl);
    const pathPattern = new RegExp(`^/images/${payload.id}/[^/]+$`);

    if (pathPattern.test(fullPath)) {
      logger.debug('[validateImageRequest] Image request validated');
      next();
    } else {
      logger.warn('[validateImageRequest] Invalid image path');
      res.status(403).send('Access Denied');
    }
  }
}

module.exports = validateImageRequest;
