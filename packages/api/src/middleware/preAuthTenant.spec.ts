import { getTenantId } from '@librechat/data-schemas';
import { preAuthTenantMiddleware } from './preAuthTenant';
import type { Request, Response, NextFunction } from 'express';

describe('preAuthTenantMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock<NextFunction>;

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = jest.fn();
  });

  it('calls next() without ALS context when no X-Tenant-Id header is present', () => {
    preAuthTenantMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    // No tenant context should be set
    expect(getTenantId()).toBeUndefined();
  });

  it('calls next() without ALS context when X-Tenant-Id header is empty', () => {
    req.headers = { 'x-tenant-id': '' };
    preAuthTenantMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getTenantId()).toBeUndefined();
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

  it('ignores array-valued headers (Express can produce these)', () => {
    req.headers = { 'x-tenant-id': ['a', 'b'] as unknown as string };
    preAuthTenantMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    // typeof check rejects arrays
    expect(getTenantId()).toBeUndefined();
  });
});
