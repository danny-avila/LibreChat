import { getTenantId } from '@librechat/data-schemas';
import { preAuthTenantMiddleware } from './preAuthTenant';
import type { Request, Response, NextFunction } from 'express';

describe('preAuthTenantMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
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

  it('rejects __SYSTEM__ sentinel to prevent tenant isolation bypass', () => {
    req.headers = { 'x-tenant-id': '__SYSTEM__' };
    let capturedTenantId: string | undefined = 'should-be-overwritten';
    const capturedNext: NextFunction = () => {
      capturedTenantId = getTenantId();
    };

    preAuthTenantMiddleware(req as Request, res as Response, capturedNext);
    expect(capturedTenantId).toBeUndefined();
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
});
