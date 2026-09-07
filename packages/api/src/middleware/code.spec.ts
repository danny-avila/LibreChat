import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import {
  codeEnvironmentPairingLimiter,
  codeEnvironmentStatusIpLimiter,
  codeEnvironmentStatusLimiter,
} from './code';
import { limiterCache } from '~/cache/cacheFactory';

jest.mock('express-rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn((_req: Request, _res: Response, next: NextFunction) => next())),
  ipKeyGenerator: jest.fn((ip: string | undefined) => ip ?? ''),
}));
jest.mock('~/cache/cacheFactory', () => ({ limiterCache: jest.fn(() => undefined) }));

const mockRateLimit = jest.mocked(rateLimit);
const mockIpKeyGenerator = jest.mocked(ipKeyGenerator);
const mockLimiterCache = jest.mocked(limiterCache);

type LimiterOptions = {
  max: number;
  windowMs: number;
  keyGenerator: (req: Request) => string;
  handler: (req: Request, res: Response) => void;
};

describe('code environment limiters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses a bounded per-user pairing bucket', () => {
    const req = { user: { id: 'user-1' } } as Request & { user: { id: string } };

    codeEnvironmentPairingLimiter(req, {} as Response, jest.fn());

    const options = mockRateLimit.mock.calls[
      mockRateLimit.mock.calls.length - 1
    ]?.[0] as LimiterOptions;
    expect(options).toEqual(expect.objectContaining({ max: 5, windowMs: 3_600_000 }));
    expect(options.keyGenerator(req)).toBe('user-1');
    expect(mockLimiterCache).toHaveBeenCalledWith('code_environment_pairing_user_limiter');
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as Partial<Response> as Response;
    const now = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    try {
      options.handler(
        Object.assign(req, { rateLimit: { resetTime: new Date(1700000030000) } }),
        res,
      );
      expect(res.set).toHaveBeenLastCalledWith('Retry-After', '30');
      options.handler(Object.assign(req, { rateLimit: undefined }), res);
      expect(res.set).toHaveBeenLastCalledWith('Retry-After', '3600');
      expect(res.status).toHaveBeenCalledWith(429);
    } finally {
      now.mockRestore();
    }
  });

  test('keys status user limits by immutable user ID', () => {
    const req = { user: { id: 'user-1' }, ip: '2001:db8::1' } as Request & { user: { id: string } };

    codeEnvironmentStatusLimiter(req, {} as Response, jest.fn());

    const options = mockRateLimit.mock.calls[
      mockRateLimit.mock.calls.length - 1
    ]?.[0] as LimiterOptions;
    expect(options).toEqual(expect.objectContaining({ max: 120, windowMs: 60_000 }));
    expect(options.keyGenerator(req)).toBe('user-1');
    expect(mockIpKeyGenerator).not.toHaveBeenCalled();
    expect(mockLimiterCache).toHaveBeenCalledWith('code_environment_status_user_limiter');
  });

  test('applies an independent normalized IP status limit', () => {
    const req = { user: { id: 'user-1' }, ip: '2001:db8::1' } as Request & { user: { id: string } };

    codeEnvironmentStatusIpLimiter(req, {} as Response, jest.fn());

    const options = mockRateLimit.mock.calls[
      mockRateLimit.mock.calls.length - 1
    ]?.[0] as LimiterOptions;
    expect(options).toEqual(expect.objectContaining({ max: 300, windowMs: 60_000 }));
    expect(options.keyGenerator(req)).toBe('2001:db8::1');
    expect(mockIpKeyGenerator).toHaveBeenCalledWith('2001:db8::1');
    expect(mockLimiterCache).toHaveBeenCalledWith('code_environment_status_ip_limiter');
    expect(options.keyGenerator({} as Request)).toBe('');
    expect(mockIpKeyGenerator).toHaveBeenLastCalledWith('');
  });
});
