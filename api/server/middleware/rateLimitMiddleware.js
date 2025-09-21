const redisRateLimiter = require('./limiters/redisRateLimiter');
const { getClientIP } = require('../utils/requestUtils');
const { LoggingSystem } = require('../../utils/LoggingSystem');
const logger = new LoggingSystem();

const rateLimitConfig = {
  login: { points: 5, duration: 300 }, // 5 attempts per 5 minutes
  register: { points: 3, duration: 3600 }, // 3 attempts per hour
  messages: { points: 100, duration: 60 }, // 100 messages per minute
  fileUploads: { points: 20, duration: 300 }, // 20 uploads per 5 minutes
  apiKeys: { points: 10, duration: 3600 } // 10 key operations per hour
};

async function rateLimitMiddleware(req, res, next) {
  const route = getRouteKey(req);
  const clientId = getClientIdentifier(req);
  
  if (!rateLimitConfig[route]) {
    return next();
  }

  const config = rateLimitConfig[route];
  const result = await redisRateLimiter.consume(`${route}:${clientId}`, 1, config);

  if (!result.success) {
    logger.warn(`Rate limit exceeded for ${route} by ${clientId}`);
    
    res.setHeader('Retry-After', Math.ceil(result.msBeforeNext / 1000));
    res.setHeader('X-RateLimit-Limit', config.points);
    res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
    res.setHeader('X-RateLimit-Reset', new Date(Date.now() + result.msBeforeNext).toISOString());

    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil(result.msBeforeNext / 1000),
      limit: config.points,
      remaining: result.remainingPoints,
      reset: new Date(Date.now() + result.msBeforeNext).toISOString()
    });
  }

  res.setHeader('X-RateLimit-Limit', config.points);
  res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + result.msBeforeNext).toISOString());

  next();
}

function getRouteKey(req) {
  const path = req.route?.path || req.path;
  
  if (path.includes('/auth/login')) return 'login';
  if (path.includes('/auth/register')) return 'register';
  if (path.includes('/api/messages')) return 'messages';
  if (path.includes('/files/upload')) return 'fileUploads';
  if (path.includes('/keys')) return 'apiKeys';
  
  return 'general';
}

function getClientIdentifier(req) {
  // Prefer authenticated user ID, fall back to IP
  return req.user?.id || getClientIP(req);
}

module.exports = {
  rateLimitMiddleware,
  redisRateLimiter,
  rateLimitConfig
};