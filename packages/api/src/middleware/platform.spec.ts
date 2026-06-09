import { generatePlatformAdminCheck } from './platform';

describe('generatePlatformAdminCheck', () => {
  const getUserPrincipals = jest.fn();
  const hasCapabilityForPrincipals = jest.fn();

  const { isPlatformAdmin, requirePlatformAdmin } = generatePlatformAdminCheck({
    getUserPrincipals,
    hasCapabilityForPrincipals,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getUserPrincipals.mockResolvedValue([{ principalType: 'USER', principalId: 'user-1' }]);
  });

  it('returns false when user has tenantId', async () => {
    const result = await isPlatformAdmin({
      id: 'user-1',
      role: 'ADMIN',
      tenantId: 'tenant-a',
    });
    expect(result).toBe(false);
    expect(hasCapabilityForPrincipals).not.toHaveBeenCalled();
  });

  it('returns true when user has no tenantId and platform access:admin', async () => {
    hasCapabilityForPrincipals.mockResolvedValue(true);
    const result = await isPlatformAdmin({
      id: 'user-1',
      role: 'ADMIN',
    });
    expect(result).toBe(true);
    expect(hasCapabilityForPrincipals).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined }),
    );
  });

  it('requirePlatformAdmin rejects tenant-scoped admin', async () => {
    const middleware = requirePlatformAdmin();
    const req = {
      user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();
    await middleware(req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
