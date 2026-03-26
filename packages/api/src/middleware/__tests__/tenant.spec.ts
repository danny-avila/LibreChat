import { getTenantId } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';
// Import directly from source file — _resetTenantMiddlewareStrictCache is intentionally
// excluded from the public barrel export (index.ts).
import { tenantContextMiddleware, _resetTenantMiddlewareStrictCache } from '../tenant';

function mockReq(user?: Record<string, unknown>): ServerRequest {
  return { user } as unknown as ServerRequest;
}

function mockRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

/** Runs the middleware and returns a Promise that resolves when next() is called. */
function runMiddleware(req: ServerRequest, res: Response): Promise<string | undefined> {
  return new Promise((resolve) => {
    const next: NextFunction = () => {
      resolve(getTenantId());
    };
    tenantContextMiddleware(req, res, next);
  });
}

describe('tenantContextMiddleware', () => {
  afterEach(() => {
    _resetTenantMiddlewareStrictCache();
    delete process.env.TENANT_ISOLATION_STRICT;
  });

  it('sets ALS tenant context for authenticated requests with tenantId', async () => {
    const req = mockReq({ tenantId: 'tenant-x', role: 'user' });
    const res = mockRes();

    const tenantId = await runMiddleware(req, res);
    expect(tenantId).toBe('tenant-x');
  });

  it('is a no-op for unauthenticated requests (no user)', async () => {
    const req = mockReq();
    const res = mockRes();

    const tenantId = await runMiddleware(req, res);
    expect(tenantId).toBeUndefined();
  });

  it('passes through without ALS when user has no tenantId in non-strict mode', async () => {
    const req = mockReq({ role: 'user' });
    const res = mockRes();

    const tenantId = await runMiddleware(req, res);
    expect(tenantId).toBeUndefined();
  });

  it('returns 403 when user has no tenantId in strict mode', () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = mockReq({ role: 'user' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    tenantContextMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Tenant context required') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows authenticated requests with tenantId in strict mode', async () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = mockReq({ tenantId: 'tenant-y', role: 'admin' });
    const res = mockRes();

    const tenantId = await runMiddleware(req, res);
    expect(tenantId).toBe('tenant-y');
  });

  it('different requests get independent tenant contexts', async () => {
    const runRequest = (tid: string) => {
      const req = mockReq({ tenantId: tid, role: 'user' });
      const res = mockRes();
      return runMiddleware(req, res);
    };

    const results = await Promise.all([runRequest('tenant-1'), runRequest('tenant-2')]);

    expect(results).toHaveLength(2);
    expect(results).toContain('tenant-1');
    expect(results).toContain('tenant-2');
  });
});
