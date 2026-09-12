import { MemoryStore } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { createMCPAppRateLimiter } from './limits';

type LimitOverrides = {
  resourcesPerMinute?: number;
  toolCallsPerMinute?: number;
};

type Invocation = {
  status: number;
  body?: unknown;
  headers: Record<string, string>;
};

function createHarness(kind: 'resource' | 'toolCall', limits?: LimitOverrides) {
  const logViolation = jest.fn().mockResolvedValue(undefined);
  const middleware = createMCPAppRateLimiter(kind, {
    store: new MemoryStore(),
    logViolation,
    score: 3,
  });

  const invoke = (): Promise<Invocation> =>
    new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      const request = {
        user: { id: 'user-1' },
        config: limits ? { config: { rateLimits: { mcpApps: limits } } } : { config: {} },
      } as unknown as Request;
      const response = {
        headersSent: false,
        setHeader(name: string, value: string | number) {
          headers[name.toLowerCase()] = String(value);
          return response;
        },
        status(code: number) {
          response.statusCode = code;
          return response;
        },
        json(body: unknown) {
          resolve({ status: response.statusCode, body, headers });
          return response;
        },
        statusCode: 200,
      } as unknown as Response;
      const next: NextFunction = (error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ status: 200, headers });
      };

      middleware(request, response, next);
    });

  return { invoke, logViolation };
}

describe('createMCPAppRateLimiter', () => {
  it.each([
    ['resource' as const, '120'],
    ['toolCall' as const, '60'],
  ])('uses the schema default for %s requests', async (kind, expected) => {
    const { invoke } = createHarness(kind);

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBe(expected);
  });

  it.each([
    ['resource' as const, { resourcesPerMinute: 2 }, 'resource'],
    ['toolCall' as const, { toolCallsPerMinute: 2 }, 'tool call'],
  ])(
    'applies the request-scoped %s limit and reports its effective value',
    async (kind, limits, label) => {
      const { invoke, logViolation } = createHarness(kind, limits);

      expect((await invoke()).status).toBe(200);
      expect((await invoke()).status).toBe(200);
      const limited = await invoke();

      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({
        message: `Too many app ${label} requests. Try again later`,
      });
      expect(logViolation).toHaveBeenCalledWith(
        expect.objectContaining({ user: { id: 'user-1' } }),
        expect.anything(),
        'tool_call_limit',
        {
          type: 'tool_call_limit',
          max: 2,
          limiter: 'user',
          windowInMinutes: 1,
        },
        3,
      );
    },
  );
});
