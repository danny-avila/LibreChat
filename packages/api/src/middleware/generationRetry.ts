import { rateLimit } from 'express-rate-limit';
import { logger } from '@librechat/data-schemas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { limiterCache } from '~/cache/cacheFactory';
import { GenerationJobManager } from '~/stream/GenerationJobManager';

const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const confirmedGenerationRetry: unique symbol = Symbol('confirmedGenerationRetry');

export const GENERATION_RETRY_WINDOW_MS = 60_000;
export const GENERATION_RETRY_MAX = 10;

type GenerationRetryRequest = Request & {
  user?: { id?: string };
  [confirmedGenerationRetry]?: boolean;
};

/**
 * Classifies only retries already represented by a durable generation claim.
 * The controller still owns the authoritative claim/read transition.
 */
export async function detectGenerationRetry(
  req: GenerationRetryRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const clientRequestId = req.body?.clientRequestId;
  const userId = req.user?.id;
  const normalizedPath = req.path.replace(/\/+$/, '').toLowerCase();
  if (
    req.method !== 'POST' ||
    normalizedPath === '/resume' ||
    typeof userId !== 'string' ||
    typeof clientRequestId !== 'string' ||
    !CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)
  ) {
    next();
    return;
  }

  try {
    req[confirmedGenerationRetry] = await GenerationJobManager.hasGenerationClaim(
      userId,
      clientRequestId,
    );
  } catch (error) {
    logger.warn('[GenerationIdempotency] Failed to inspect start-generation claim', {
      userId,
      clientRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  next();
}

export function isConfirmedGenerationRetry(req: Request): boolean {
  return (req as GenerationRetryRequest)[confirmedGenerationRetry] === true;
}

/**
 * Confirmed retries bypass the ordinary message buckets so a lost response can
 * be recovered, but they still receive a small user-scoped allowance before
 * moderation and the rest of the request pipeline. This bounds replay costs
 * while leaving the authoritative generation claim unchanged.
 */
export const generationRetryLimiter: RequestHandler = rateLimit({
  windowMs: GENERATION_RETRY_WINDOW_MS,
  max: GENERATION_RETRY_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isConfirmedGenerationRetry(req),
  keyGenerator: (req) => String((req as GenerationRetryRequest).user?.id),
  store: limiterCache('generation_retry_limiter'),
  handler: (_req, res) => {
    res
      .status(429)
      .type('application/json')
      .json({
        error: {
          code: 'generation_retry_rate_limited',
          message: 'Too many generation retry attempts. Please try again shortly.',
          type: 'rate_limit_error',
        },
      });
  },
});
