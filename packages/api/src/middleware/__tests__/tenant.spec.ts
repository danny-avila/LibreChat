import { getTenantId, SYSTEM_TENANT_ID } from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';
// Import directly from source file — _resetTenantMiddlewareStrictCache is intentionally
// excluded from the public barrel export (index.ts).
import {
  tenantContextMiddleware,
  restoreTenantContextFromReq,
  _resetTenantMiddlewareStrictCache,
} from '../tenant';

function mockReq(user?: Record<string, unknown>): ServerRequest {
  return { user } as unknown as ServerRequest;
}

function mockTenantReq(user?: Record<string, unknown>, tenantId?: string): ServerRequest {
  return { user, tenantId } as unknown as ServerRequest;
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

describe('restoreTenantContextFromReq', () => {
  afterEach(() => {
    _resetTenantMiddlewareStrictCache();
    delete process.env.TENANT_ISOLATION_STRICT;
  });

  it('restores ALS tenant context from req.user.tenantId', async () => {
    const req = mockReq({ tenantId: 'tenant-user', role: 'user' });
    const res = mockRes();

    const tenantId = await new Promise<string | undefined>((resolve) => {
      const next: NextFunction = async () => {
        await Promise.resolve();
        resolve(getTenantId());
      };
      restoreTenantContextFromReq(req, res, next);
    });

    expect(tenantId).toBe('tenant-user');
  });

  it('prefers server-resolved req.tenantId over req.user.tenantId', async () => {
    const req = mockTenantReq({ tenantId: 'tenant-user', role: 'user' }, 'tenant-request');
    const res = mockRes();

    const tenantId = await new Promise<string | undefined>((resolve) => {
      restoreTenantContextFromReq(req, res, () => {
        resolve(getTenantId());
      });
    });

    expect(tenantId).toBe('tenant-request');
  });

  it('returns 403 in strict mode when no request tenant can be resolved', () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = mockReq({ role: 'user' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    restoreTenantContextFromReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Tenant context required') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects the system tenant sentinel for request-owned work', () => {
    const req = mockReq({ tenantId: SYSTEM_TENANT_ID, role: 'user' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    restoreTenantContextFromReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
