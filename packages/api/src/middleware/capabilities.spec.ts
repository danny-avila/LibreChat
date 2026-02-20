import {
  PrincipalType,
  configCapability,
  SystemCapabilities,
  readConfigCapability,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { generateCapabilityCheck } from './capabilities';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
  },
}));

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

describe('generateCapabilityCheck', () => {
  const mockGetUserPrincipals = jest.fn();
  const mockHasCapabilityForPrincipals = jest.fn();

  const { hasCapability, requireCapability, hasConfigCapability } = generateCapabilityCheck({
    getUserPrincipals: mockGetUserPrincipals,
    hasCapabilityForPrincipals: mockHasCapabilityForPrincipals,
  });

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
    let mockReq: Partial<ServerRequest>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
      jsonMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });

      mockReq = {
        user: { id: 'user-123', role: 'ADMIN' } as ServerRequest['user'],
      };
      mockRes = { status: statusMock };
      mockNext = jest.fn();
    });

    it('calls next() when user has the capability', async () => {
      mockGetUserPrincipals.mockResolvedValue(adminPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(true);

      const middleware = requireCapability(SystemCapabilities.ACCESS_ADMIN);
      await middleware(mockReq as ServerRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('returns 403 when user lacks the capability', async () => {
      mockReq.user = { id: 'user-456', role: 'USER' } as ServerRequest['user'];
      mockGetUserPrincipals.mockResolvedValue(userPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(false);

      const middleware = requireCapability(SystemCapabilities.MANAGE_USERS);
      await middleware(mockReq as ServerRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Forbidden' });
    });

    it('returns 401 when no user is present', async () => {
      mockReq.user = undefined;

      const middleware = requireCapability(SystemCapabilities.ACCESS_ADMIN);
      await middleware(mockReq as ServerRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Authentication required' });
    });

    it('returns 500 on unexpected error', async () => {
      mockGetUserPrincipals.mockRejectedValue(new Error('DB down'));

      const middleware = requireCapability(SystemCapabilities.ACCESS_ADMIN);
      await middleware(mockReq as ServerRequest, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('hasConfigCapability', () => {
    const adminUser = { id: 'user-123', role: 'ADMIN' };
    const delegatedUser = { id: 'user-789', role: 'MANAGER' };

    it('returns true when user has broad manage:configs capability', async () => {
      mockGetUserPrincipals.mockResolvedValue(adminPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(true);

      const result = await hasConfigCapability(adminUser, 'endpoints');

      expect(result).toBe(true);
      expect(mockHasCapabilityForPrincipals).toHaveBeenCalledWith(
        expect.objectContaining({ capability: SystemCapabilities.MANAGE_CONFIGS }),
      );
    });

    it('falls back to section-specific capability when broad check fails', async () => {
      mockGetUserPrincipals.mockResolvedValue(userPrincipals);
      // First call (broad) returns false, second call (section) returns true
      mockHasCapabilityForPrincipals.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result = await hasConfigCapability(delegatedUser, 'endpoints');

      expect(result).toBe(true);
      expect(mockHasCapabilityForPrincipals).toHaveBeenCalledTimes(2);
      expect(mockHasCapabilityForPrincipals).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ capability: configCapability('endpoints') }),
      );
    });

    it('returns false when user has neither broad nor section capability', async () => {
      mockGetUserPrincipals.mockResolvedValue(userPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValue(false);

      const result = await hasConfigCapability(delegatedUser, 'balance');

      expect(result).toBe(false);
    });

    it('checks read:configs when verb is "read"', async () => {
      mockGetUserPrincipals.mockResolvedValue(userPrincipals);
      mockHasCapabilityForPrincipals.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result = await hasConfigCapability(delegatedUser, 'endpoints', 'read');

      expect(result).toBe(true);
      expect(mockHasCapabilityForPrincipals).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ capability: SystemCapabilities.READ_CONFIGS }),
      );
      expect(mockHasCapabilityForPrincipals).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ capability: readConfigCapability('endpoints') }),
      );
    });
  });
});
