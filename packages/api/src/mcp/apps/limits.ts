import { rateLimit } from 'express-rate-limit';
import { ViolationTypes, resolveMCPAppRateLimits } from 'librechat-data-provider';
import type { AugmentedRequest, Store } from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';
import type { TCustomConfig } from 'librechat-data-provider';

type MCPAppRateLimitKind = 'resource' | 'toolCall';

type MCPAppRateLimitRequest = Request & {
  user?: { id?: string };
  config?: {
    config?: {
      rateLimits?: TCustomConfig['rateLimits'];
    };
  };
};

type ViolationDetails = {
  type: ViolationTypes;
  max: number;
  limiter: 'user';
  windowInMinutes: 1;
};

export interface MCPAppRateLimiterDependencies {
  store: Store;
  score?: number | string;
  logViolation: (
    request: Request,
    response: Response,
    type: ViolationTypes,
    details: ViolationDetails,
    score?: number | string,
  ) => Promise<void>;
}

const limiters: Record<
  MCPAppRateLimitKind,
  {
    key: keyof ReturnType<typeof resolveMCPAppRateLimits>;
    message: string;
  }
> = {
  resource: {
    key: 'resourcesPerMinute',
    message: 'Too many app resource requests. Try again later',
  },
  toolCall: {
    key: 'toolCallsPerMinute',
    message: 'Too many app tool call requests. Try again later',
  },
};

export function createMCPAppRateLimiter(
  kind: MCPAppRateLimitKind,
  dependencies: MCPAppRateLimiterDependencies,
): RequestHandler {
  const definition = limiters[kind];
  return rateLimit({
    windowMs: 60_000,
    limit: (request) => {
      const config = (request as MCPAppRateLimitRequest).config?.config;
      return resolveMCPAppRateLimits(config?.rateLimits)[definition.key];
    },
    handler: async (request, response) => {
      const type = ViolationTypes.TOOL_CALL_LIMIT;
      const details: ViolationDetails = {
        type,
        max: (request as AugmentedRequest).rateLimit.limit,
        limiter: 'user',
        windowInMinutes: 1,
      };
      await dependencies.logViolation(request, response, type, details, dependencies.score);
      response.status(429).json({ message: definition.message });
    },
    keyGenerator: (request) => String((request as MCPAppRateLimitRequest).user?.id ?? ''),
    store: dependencies.store,
  });
}
