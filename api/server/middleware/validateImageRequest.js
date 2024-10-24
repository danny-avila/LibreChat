const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const { logger } = require('~/config');

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
 * Middleware to validate image request.
 * Must be set by `secureImageLinks` via custom config file.
 */
function validateImageRequest(req, res, next) {
  if (!req.app.locals.secureImageLinks) {
    return next();
  }

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

  if (!isValidObjectId(payload.id)) {
    logger.warn('[validateImageRequest] Invalid User ID');
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

module.exports = validateImageRequest;
