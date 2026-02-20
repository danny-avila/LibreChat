const { SystemCapabilities, PrincipalType } = require('librechat-data-provider');
const { hasCapability, requireCapability } = require('./capabilities');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
  },
}));

const mockGetUserPrincipals = jest.fn();
const mockHasCapabilityForPrincipals = jest.fn();

jest.mock('~/models', () => ({
  getUserPrincipals: (...args) => mockGetUserPrincipals(...args),
  hasCapabilityForPrincipals: (...args) => mockHasCapabilityForPrincipals(...args),
}));

describe('capabilities middleware', () => {
  const adminPrincipals = [
    { principalType: PrincipalType.USER, principalId: 'user-123' },
    { principalType: PrincipalType.ROLE, principalId: 'ADMIN' },
    { principalType: PrincipalType.PUBLIC },
  ];

  const userPrincipals = [
    { principalType: PrincipalType.USER, principalId: 'user-456' },
    { principalType: PrincipalType.ROLE, principalId: 'USER' },
    { principalType: PrincipalType.PUBLIC },
  ];

  beforeEach(() => {
    mockGetUserPrincipals.mockReset();
    mockHasCapabilityForPrincipals.mockReset();
  });

  describe('hasCapability', () => {
    it('returns true for a user with the capability', async () => {
      mockGetUserPrincipals.mockResolvedValue(adminPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(true);

      const result = await hasCapability(
        { id: 'user-123', role: 'ADMIN' },
        SystemCapabilities.ACCESS_ADMIN,
      );

      expect(result).toBe(true);
      expect(mockGetUserPrincipals).toHaveBeenCalledWith({ userId: 'user-123', role: 'ADMIN' });
      expect(mockHasCapabilityForPrincipals).toHaveBeenCalledWith({
        principals: adminPrincipals,
        capability: SystemCapabilities.ACCESS_ADMIN,
        tenantId: undefined,
      });
    });

    it('returns false for a user without the capability', async () => {
      mockGetUserPrincipals.mockResolvedValue(userPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(false);

      const result = await hasCapability(
        { id: 'user-456', role: 'USER' },
        SystemCapabilities.MANAGE_USERS,
      );

      expect(result).toBe(false);
    });

    it('passes tenantId when present on user', async () => {
      mockGetUserPrincipals.mockResolvedValue(adminPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(true);

      await hasCapability(
        { id: 'user-123', role: 'ADMIN', tenantId: 'tenant-1' },
        SystemCapabilities.READ_CONFIGS,
      );

      expect(mockHasCapabilityForPrincipals).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1' }),
      );
    });
  });

  describe('requireCapability', () => {
    let req, res, next;

    beforeEach(() => {
      req = { user: { id: 'user-123', role: 'ADMIN' } };
      res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      next = jest.fn();
    });

    it('calls next() when user has the capability', async () => {
      mockGetUserPrincipals.mockResolvedValue(adminPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(true);

      const middleware = requireCapability(SystemCapabilities.ACCESS_ADMIN);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 403 when user lacks the capability', async () => {
      req.user = { id: 'user-456', role: 'USER' };
      mockGetUserPrincipals.mockResolvedValue(userPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(false);

      const middleware = requireCapability(SystemCapabilities.MANAGE_USERS);
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
    });

    it('returns 500 on unexpected error', async () => {
      mockGetUserPrincipals.mockRejectedValue(new Error('DB down'));

      const middleware = requireCapability(SystemCapabilities.ACCESS_ADMIN);
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });
});
