const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const { logger } = require('~/config');

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

  const currentTimeInSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp < currentTimeInSeconds) {
    logger.warn('[validateImageRequest] Refresh token expired');
    return res.status(403).send('Access Denied');
  }

  if (req.path.includes(payload.id)) {
    logger.debug('[validateImageRequest] Image request validated');
    next();
  } else {
    res.status(403).send('Access Denied');
  }
}

module.exports = validateImageRequest;
