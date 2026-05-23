import { unlink } from 'fs/promises';
import {
  getTenantId,
  getUserId,
  getRequestId,
  SYSTEM_TENANT_ID,
  logger,
} from '@librechat/data-schemas';
import type { Response, NextFunction } from 'express';
import type { ServerRequest } from '~/types/http';
// Import directly from source file — _resetTenantMiddlewareStrictCache is intentionally
// excluded from the public barrel export (index.ts).
import {
  tenantContextMiddleware,
  restoreTenantContextFromReq,
  resolveRequestTenantId,
  _resetTenantMiddlewareStrictCache,
} from '../tenant';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;

function mockReq(user?: Record<string, unknown>): ServerRequest {
  return { headers: {}, user } as unknown as ServerRequest;
}

function mockTenantReq(user?: Record<string, unknown>, tenantId?: string): ServerRequest {
  return { headers: {}, user, tenantId } as unknown as ServerRequest;
}

function mockReqWithHeaders(
  user: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): ServerRequest {
  return { headers, user } as unknown as ServerRequest;
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

function runMiddlewareContext(
  req: ServerRequest,
  res: Response,
): Promise<{
  tenantId?: string;
  userId?: string;
  requestId?: string;
}> {
  return new Promise((resolve) => {
    const next: NextFunction = () => {
      resolve({
        tenantId: getTenantId(),
        userId: getUserId(),
        requestId: getRequestId(),
      });
    };
    tenantContextMiddleware(req, res, next);
  });
}

describe('tenantContextMiddleware', () => {
  afterEach(() => {
    _resetTenantMiddlewareStrictCache();
    delete process.env.TENANT_ISOLATION_STRICT;
    unlinkMock.mockClear();
    jest.restoreAllMocks();
  });

  it('sets ALS tenant context for authenticated requests with tenantId', async () => {
    const req = mockReq({ tenantId: 'tenant-x', role: 'user' });
    const res = mockRes();

    const tenantId = await runMiddleware(req, res);
    expect(tenantId).toBe('tenant-x');
  });

  it('sets ALS user and request context for authenticated tenant requests', async () => {
    const req = mockReqWithHeaders(
      { id: 'user-123', tenantId: 'tenant-x', role: 'user' },
      { 'x-request-id': 'req-abc' },
    );
    const res = mockRes();

    const context = await runMiddlewareContext(req, res);

    expect(context).toEqual({
      tenantId: 'tenant-x',
      userId: 'user-123',
      requestId: 'req-abc',
    });
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

  it('keeps user context in non-strict single-tenant mode', async () => {
    const req = mockReqWithHeaders(
      { id: 'single-user', role: 'user' },
      { 'x-request-id': 'req-1' },
    );
    const res = mockRes();

    const context = await runMiddlewareContext(req, res);

    expect(context).toEqual({
      tenantId: undefined,
      userId: 'single-user',
      requestId: 'req-1',
    });
  });

  it('returns 403 when user has no tenantId in strict mode', async () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = mockReq({ role: 'user' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await tenantContextMiddleware(req, res, next);

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
    unlinkMock.mockClear();
    jest.restoreAllMocks();
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

  it('restores user and request context alongside tenant context', async () => {
    const req = mockReqWithHeaders(
      { id: 'restore-user', tenantId: 'tenant-user', role: 'user' },
      { 'x-correlation-id': 'corr-123' },
    );
    const res = mockRes();

    const context = await new Promise<{
      tenantId?: string;
      userId?: string;
      requestId?: string;
    }>((resolve) => {
      restoreTenantContextFromReq(req, res, () => {
        resolve({
          tenantId: getTenantId(),
          userId: getUserId(),
          requestId: getRequestId(),
        });
      });
    });

    expect(context).toEqual({
      tenantId: 'tenant-user',
      userId: 'restore-user',
      requestId: 'corr-123',
    });
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

  it('returns 403 in strict mode when no request tenant can be resolved', async () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = mockReq({ role: 'user' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Tenant context required') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('deletes uploaded temp files before rejecting strict requests without a tenant', async () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = {
      ...mockReq({ role: 'user' }),
      file: { path: '/tmp/no-tenant-upload' },
    } as ServerRequest;
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(unlinkMock).toHaveBeenCalledWith('/tmp/no-tenant-upload');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps request context while cleaning up rejected strict-mode uploads', async () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();
    unlinkMock.mockRejectedValueOnce(new Error('unlink failed'));
    let observedContext: { userId?: string; requestId?: string } | undefined;
    jest.spyOn(logger, 'error').mockImplementation(() => {
      observedContext = {
        userId: getUserId(),
        requestId: getRequestId(),
      };
      return logger;
    });

    const req = {
      ...mockReqWithHeaders({ id: 'strict-user', role: 'user' }, { 'x-request-id': 'req-strict' }),
      file: { path: '/tmp/no-tenant-upload' },
    } as ServerRequest;
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      '[restoreTenantContextFromReq] Failed to delete rejected upload:',
      expect.objectContaining({ path: '/tmp/no-tenant-upload' }),
    );
    expect(observedContext).toEqual({ userId: 'strict-user', requestId: 'req-strict' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects the system tenant sentinel for request-owned work', async () => {
    const req = mockReq({ tenantId: SYSTEM_TENANT_ID, role: 'user' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a normalized system tenant sentinel for request-owned work', async () => {
    const req = mockTenantReq({ role: 'user' }, ` ${SYSTEM_TENANT_ID} `);
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'System tenant is not allowed for request-scoped routes',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects blank server-resolved tenant IDs in strict mode', async () => {
    process.env.TENANT_ISOLATION_STRICT = 'true';
    _resetTenantMiddlewareStrictCache();

    const req = mockTenantReq({ role: 'user' }, '   ');
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Tenant context required') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('deletes uploaded temp files before rejecting system-tenant requests', async () => {
    const req = {
      ...mockReq({ tenantId: SYSTEM_TENANT_ID, role: 'user' }),
      file: { path: '/tmp/system-tenant-upload' },
      files: [{ path: '/tmp/system-tenant-extra' }],
    } as ServerRequest;
    const res = mockRes();
    const next: NextFunction = jest.fn();

    await restoreTenantContextFromReq(req, res, next);

    expect(unlinkMock).toHaveBeenCalledWith('/tmp/system-tenant-upload');
    expect(unlinkMock).toHaveBeenCalledWith('/tmp/system-tenant-extra');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'System tenant is not allowed for request-scoped routes',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('resolveRequestTenantId', () => {
  it('uses req.tenantId before req.user.tenantId', () => {
    const req = mockTenantReq({ tenantId: 'tenant-user', role: 'user' }, 'tenant-request');

    expect(resolveRequestTenantId(req)).toBe('tenant-request');
  });

  it('falls back to req.user.tenantId', () => {
    const req = mockReq({ tenantId: 'tenant-user', role: 'user' });

    expect(resolveRequestTenantId(req)).toBe('tenant-user');
  });
});
