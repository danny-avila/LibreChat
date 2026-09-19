import { ViolationTypes } from 'librechat-data-provider';
import type { Request, Response, RequestHandler } from 'express';
import type { Store, RateLimitInfo } from 'express-rate-limit';
import type rateLimit from 'express-rate-limit';
import type { RateLimitReset } from '../utils/limiter';
import { getRateLimitReset } from '../utils/limiter';
import { removePorts } from '../utils/ports';

export interface MessageRateLimitError extends RateLimitReset {
  type: typeof ViolationTypes.MESSAGE_LIMIT;
  max: number;
  limiter: 'ip' | 'user';
  windowInMinutes: number;
}
export interface RateLimitResponseLocals {
  rateLimitError?: (error: MessageRateLimitError) => void;
}
type LimitRequest = Request & {
  user?: Express.User & { id?: string };
  apiKeyId?: string;
  rateLimit?: RateLimitInfo;
};

/** One set of shared buckets; the request host supplies JSON or chat-stream error presentation. */
export function createMessageLimiters({
  factory,
  createStore,
  environment,
  logViolation,
  denyRequest,
}: {
  factory: typeof rateLimit;
  createStore(prefix: string): Store | undefined;
  environment: Record<string, string | undefined>;
  logViolation(
    req: Request,
    res: Response,
    type: string,
    error: MessageRateLimitError,
    score?: string,
  ): Promise<unknown>;
  denyRequest(req: Request, res: Response, error: MessageRateLimitError): Promise<unknown>;
}): {
  messageIpLimiter: RequestHandler;
  messageUserLimiter: RequestHandler;
  agentEventUserLimiter: RequestHandler;
} {
  const create = (kind: 'ip' | 'user') => {
    const max = Number(environment[kind === 'ip' ? 'MESSAGE_IP_MAX' : 'MESSAGE_USER_MAX'] ?? 40);
    const windowInMinutes = Number(
      environment[kind === 'ip' ? 'MESSAGE_IP_WINDOW' : 'MESSAGE_USER_WINDOW'] ?? 1,
    );
    const windowMs = windowInMinutes * 60_000;
    return factory({
      windowMs,
      max,
      handler: async (req, res: Response<unknown, RateLimitResponseLocals>) => {
        const request = req as LimitRequest;
        const error: MessageRateLimitError = {
          type: ViolationTypes.MESSAGE_LIMIT,
          max,
          limiter: kind,
          windowInMinutes,
          ...getRateLimitReset(request.rateLimit, windowMs),
        };
        await logViolation(
          req,
          res,
          ViolationTypes.MESSAGE_LIMIT,
          error,
          environment.MESSAGE_VIOLATION_SCORE,
        );
        if (res.locals?.rateLimitError) return res.locals.rateLimitError(error);
        await denyRequest(req, res, error);
      },
      keyGenerator:
        kind === 'ip'
          ? (req) => removePorts(req) ?? ''
          : (req) => String((req as LimitRequest).user?.id),
      store: createStore(`message_${kind}_limiter`),
    });
  };
  const createEventLimiter = () => {
    const windowMs = Number(environment.AGENT_EVENT_USER_WINDOW ?? 1) * 60_000;
    return factory({
      windowMs,
      max: Number(environment.AGENT_EVENT_USER_MAX ?? 40),
      handler: (request, response) => {
        const { retryAfterSeconds } = getRateLimitReset(
          (request as LimitRequest).rateLimit,
          windowMs,
        );
        response
          .set('Retry-After', String(retryAfterSeconds))
          .status(429)
          .type('application/json')
          .json({
            error: {
              code: 'agent_event_rate_limited',
              message: 'Agent event admission rate limit exceeded.',
              type: 'rate_limit_error',
            },
          });
      },
      keyGenerator: (req) => {
        const request = req as LimitRequest;
        return String(request.apiKeyId ?? request.user?.id);
      },
      store: createStore('agent_event_user_limiter'),
    });
  };
  let eventLimiter: RequestHandler | undefined;
  const agentEventUserLimiter: RequestHandler = (req, res, next) => {
    eventLimiter ??= createEventLimiter();
    return eventLimiter(req, res, next);
  };
  return {
    messageIpLimiter: create('ip'),
    messageUserLimiter: create('user'),
    agentEventUserLimiter,
  };
}
