const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');

let configuredCodeEnvironmentPairingLimiter;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

const codeEnvironmentPairingLimiter = (req, res, next) => {
  if (configuredCodeEnvironmentPairingLimiter == null) {
    const max = positiveInteger(process.env.CODE_ENVIRONMENT_PAIRING_USER_MAX, 5);
    const windowInMinutes = positiveInteger(process.env.CODE_ENVIRONMENT_PAIRING_USER_WINDOW, 60);

    configuredCodeEnvironmentPairingLimiter = rateLimit({
      windowMs: windowInMinutes * 60 * 1000,
      max,
      handler: (limitedReq, limitedRes) => {
        const resetAt = limitedReq.rateLimit?.resetTime?.getTime?.();
        const retryAfterSeconds = Number.isFinite(resetAt)
          ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
          : Math.max(1, Math.ceil(windowInMinutes * 60));
        limitedRes.set('Retry-After', String(retryAfterSeconds));
        return limitedRes.status(429).json({
          error: {
            code: 'code_environment_pairing_rate_limited',
            message: 'Code environment pairing rate limit exceeded.',
            type: 'rate_limit_error',
          },
        });
      },
      keyGenerator: (limitedReq) => String(limitedReq.user.id),
      store: limiterCache('code_environment_pairing_user_limiter'),
    });
  }

  return configuredCodeEnvironmentPairingLimiter(req, res, next);
};

module.exports = { codeEnvironmentPairingLimiter };
