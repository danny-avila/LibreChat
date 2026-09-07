import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { limiterCache } from '~/cache/cacheFactory';

type AuthenticatedRequest = Request & { user?: { id?: string } };

let configuredPairingLimiter: RequestHandler | undefined;
let configuredStatusIpLimiter: RequestHandler | undefined;
let configuredStatusLimiter: RequestHandler | undefined;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

export const codeEnvironmentPairingLimiter: RequestHandler = (req, res, next) => {
  if (configuredPairingLimiter == null) {
    const max = positiveInteger(process.env.CODE_ENVIRONMENT_PAIRING_USER_MAX, 5);
    const windowInMinutes = positiveInteger(process.env.CODE_ENVIRONMENT_PAIRING_USER_WINDOW, 60);
    configuredPairingLimiter = rateLimit({
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
      keyGenerator: (limitedReq) => String((limitedReq as AuthenticatedRequest).user?.id ?? ''),
      store: limiterCache('code_environment_pairing_user_limiter'),
    });
  }
  return configuredPairingLimiter(req, res, next);
};

export const codeEnvironmentStatusLimiter: RequestHandler = (req, res, next) => {
  if (configuredStatusLimiter == null) {
    const max = positiveInteger(process.env.CODE_ENVIRONMENT_STATUS_USER_MAX, 120);
    const windowInMinutes = positiveInteger(process.env.CODE_ENVIRONMENT_STATUS_USER_WINDOW, 1);
    configuredStatusLimiter = rateLimit({
      windowMs: windowInMinutes * 60 * 1000,
      max,
      handler: (_limitedReq, limitedRes) =>
        limitedRes.status(429).json({
          error: {
            code: 'code_environment_status_rate_limited',
            message: 'Code environment status rate limit exceeded.',
            type: 'rate_limit_error',
          },
        }),
      keyGenerator: (limitedReq) => String((limitedReq as AuthenticatedRequest).user?.id ?? ''),
      store: limiterCache('code_environment_status_user_limiter'),
    });
  }
  return configuredStatusLimiter(req, res, next);
};

export const codeEnvironmentStatusIpLimiter: RequestHandler = (req, res, next) => {
  if (configuredStatusIpLimiter == null) {
    const max = positiveInteger(process.env.CODE_ENVIRONMENT_STATUS_IP_MAX, 300);
    const windowInMinutes = positiveInteger(process.env.CODE_ENVIRONMENT_STATUS_IP_WINDOW, 1);
    configuredStatusIpLimiter = rateLimit({
      windowMs: windowInMinutes * 60 * 1000,
      max,
      handler: (_limitedReq, limitedRes) =>
        limitedRes.status(429).json({
          error: {
            code: 'code_environment_status_rate_limited',
            message: 'Code environment status rate limit exceeded.',
            type: 'rate_limit_error',
          },
        }),
      keyGenerator: (limitedReq) => ipKeyGenerator(limitedReq.ip),
      store: limiterCache('code_environment_status_ip_limiter'),
    });
  }
  return configuredStatusIpLimiter(req, res, next);
};
