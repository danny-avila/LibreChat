const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { removePorts } = require('~/server/utils');
const writeDenialAudit = require('./writeDenialAudit');

const MIN_RATE = 1;
const MAX_RATE = 1000;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const parsedRate = parseInt(process.env.ADMIN_RATE_LIMIT_PER_MIN || '60', 10);
const max = clamp(parsedRate, MIN_RATE, MAX_RATE);
const windowMs = 60 * 1000;

const handler = (req, res) => {
  res.status(429).json({ message: 'Too many admin requests, slow down.' });
  // Fire-and-forget: rate-limit denials are recorded as audit rows so the
  // trail is complete even when the per-route auditLogger never attaches.
  writeDenialAudit(req, res, 'rate_limit');
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: (req) => req.user?.id || removePorts(req),
  store: limiterCache('admin_limiter'),
};

const adminRateLimiter = rateLimit(limiterOptions);

module.exports = adminRateLimiter;
