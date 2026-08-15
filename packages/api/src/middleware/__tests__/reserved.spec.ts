import { getTenantId, RESERVED_TENANT_IDS, BASE_TENANT_ID, logger } from '@librechat/data-schemas';
import type { Request, Response, NextFunction } from 'express';
import type { IUser } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types/http';
import { preAuthTenantMiddleware } from '../preAuthTenant';
import { tenantContextMiddleware } from '../tenant';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

function mockRes(): Response {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

/**
 * Only the fields each middleware reads. A real `Request`/`ServerRequest`
 * satisfies both, so the assertion at each call site narrows a supertype rather
 * than inventing a shape the compiler cannot check.
 */
type PreAuthRequest = Partial<Request>;
type AuthenticatedRequest = Omit<Partial<ServerRequest>, 'user'> & { user?: Partial<IUser> };

function runPreAuth(headerValue: string): {
  tenantId: string | undefined;
  nextCalls: number;
  res: Response;
} {
  const req: PreAuthRequest = {
    headers: { 'x-tenant-id': headerValue },
    ip: '10.0.0.1',
    path: '/api/auth/register',
  };
  const res = mockRes();

  let tenantId: string | undefined = 'next-was-never-called';
  let nextCalls = 0;
  const next: NextFunction = () => {
    nextCalls += 1;
    tenantId = getTenantId();
  };

  preAuthTenantMiddleware(req as Request, res as Response, next);

  return { tenantId, nextCalls, res };
}

function runAuthenticated(tenantId: string): { nextCalls: number; res: Response } {
  const req: AuthenticatedRequest = {
    headers: {},
    user: { id: 'user-1', tenantId, role: 'user' },
  };
  const res = mockRes();

  let nextCalls = 0;
  const next: NextFunction = () => {
    nextCalls += 1;
  };

  tenantContextMiddleware(req as ServerRequest, res as Response, next);

  return { nextCalls, res };
}

/**
 * The pre-auth middleware is the only tenant-context constructor fed directly by
 * a client-supplied value, so it is the one that has to refuse every reserved
 * sentinel rather than just the system one. Reserved ids satisfy the header's
 * character and length validators, so nothing further down would catch them.
 */
describe('preAuthTenantMiddleware reserved tenant handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([...RESERVED_TENANT_IDS])('discards reserved sentinel %s from the header', (reserved) => {
    const { tenantId, nextCalls } = runPreAuth(reserved);

    expect(tenantId).toBeUndefined();
    expect(nextCalls).toBe(1);
  });

  it.each([...RESERVED_TENANT_IDS])('discards padded reserved sentinel %s', (reserved) => {
    expect(runPreAuth(`  ${reserved}  `).tenantId).toBeUndefined();
  });

  it('leaves unauthenticated registration without the base sentinel in context', () => {
    const { tenantId, nextCalls, res } = runPreAuth(BASE_TENANT_ID);

    expect(tenantId).toBeUndefined();
    expect(nextCalls).toBe(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('logs the discarded base sentinel with request attribution', () => {
    runPreAuth(BASE_TENANT_ID);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(BASE_TENANT_ID),
      expect.objectContaining({ ip: '10.0.0.1', path: '/api/auth/register' }),
    );
  });

  it('still admits a real tenant id', () => {
    expect(runPreAuth('acme-corp').tenantId).toBe('acme-corp');
  });

  it('admits sentinel-shaped ids that are not reserved', () => {
    expect(runPreAuth('__NOT_RESERVED__').tenantId).toBe('__NOT_RESERVED__');
  });
});

/**
 * Both inbound constructors read the same reserved set, so a sentinel can never
 * be refused on one path while the other quietly installs it.
 */
describe('inbound tenant constructors agree on the reserved set', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([...RESERVED_TENANT_IDS])('refuses %s before and after authentication', (reserved) => {
    expect(runPreAuth(reserved).tenantId).toBeUndefined();

    const authenticated = runAuthenticated(reserved);
    expect(authenticated.res.status).toHaveBeenCalledWith(403);
    expect(authenticated.nextCalls).toBe(0);
  });
});
