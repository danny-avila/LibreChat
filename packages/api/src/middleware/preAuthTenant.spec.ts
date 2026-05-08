import { getTenantId, logger } from '@librechat/data-schemas';
import { preAuthTenantMiddleware } from './preAuthTenant';
import type { Request, Response, NextFunction } from 'express';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('preAuthTenantMiddleware', () => {
  let req: { headers: Record<string, string | string[] | undefined>; ip?: string; path?: string };
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {} };
    res = {};
  });

  it('calls next() without ALS context when no X-Tenant-Id header is present', () => {
    let capturedTenantId: string | undefined = 'sentinel';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
  });

  it('calls next() without ALS context when X-Tenant-Id header is empty', () => {
    req.headers = { 'x-tenant-id': '' };
    let capturedTenantId: string | undefined = 'sentinel';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
  });

  it('wraps downstream in ALS context when X-Tenant-Id header is present', () => {
    req.headers = { 'x-tenant-id': 'acme-corp' };
    let capturedTenantId: string | undefined;
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBe('acme-corp');
  });

  it('ignores __SYSTEM__ sentinel and logs warning', () => {
    req.headers = { 'x-tenant-id': '__SYSTEM__' };
    req.ip = '10.0.0.1';
    req.path = '/api/config';
    let capturedTenantId: string | undefined = 'should-be-overwritten';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('__SYSTEM__'),
      expect.objectContaining({ ip: '10.0.0.1', path: '/api/config' }),
    );
  });

  it('ignores array-valued headers (Express can produce these)', () => {
    req.headers = { 'x-tenant-id': ['a', 'b'] as unknown as string };
    let capturedTenantId: string | undefined = 'sentinel';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
  });

  it('ignores tenant IDs containing invalid characters and logs warning', () => {
    req.headers = { 'x-tenant-id': 'tenant:injected' };
    req.ip = '192.168.1.1';
    req.path = '/api/auth/login';
    let capturedTenantId: string | undefined = 'sentinel';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('malformed'),
      expect.objectContaining({ ip: '192.168.1.1', path: '/api/auth/login' }),
    );
  });

  it('trims whitespace from tenant ID header', () => {
    req.headers = { 'x-tenant-id': '  acme-corp  ' };
    let capturedTenantId: string | undefined;
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBe('acme-corp');
  });

  it('ignores tenant IDs exceeding max length and logs warning', () => {
    req.headers = { 'x-tenant-id': 'a'.repeat(200) };
    req.ip = '192.168.1.1';
    req.path = '/api/share/abc';
    let capturedTenantId: string | undefined = 'sentinel';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('malformed'),
      expect.objectContaining({ ip: '192.168.1.1', length: 200, path: '/api/share/abc' }),
    );
  });
});
