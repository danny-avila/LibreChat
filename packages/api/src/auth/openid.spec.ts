import { ErrorTypes } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { IUser, UserMethods } from '@librechat/data-schemas';
import { findOpenIDUser } from './openid';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('findOpenIDUser', () => {
  let mockFindUser: jest.MockedFunction<UserMethods['findUser']>;

  beforeEach(() => {
    mockFindUser = jest.fn();
    jest.clearAllMocks();
    (logger.warn as jest.Mock).mockClear();
    (logger.info as jest.Mock).mockClear();
  });

  describe('Primary condition searches', () => {
    it('should find user by openidId', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'openid',
        openidId: 'openid_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [{ openidId: 'openid_123' }],
      });
      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });

    it('should find user by idOnTheSource', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'openid',
        idOnTheSource: 'source_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        idOnTheSource: 'source_123',
      });

      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [{ openidId: 'openid_123' }, { idOnTheSource: 'source_123' }],
      });
      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });

    it('should find user by both openidId and idOnTheSource', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'openid',
        openidId: 'openid_123',
        idOnTheSource: 'source_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        idOnTheSource: 'source_123',
        email: 'user@example.com',
      });

      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [{ openidId: 'openid_123' }, { idOnTheSource: 'source_123' }],
      });
      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });
  });

  describe('Email-based searches', () => {
    it('should find user by email when primary conditions fail', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'openid',
        openidId: 'openid_456',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(mockUser); // Email search succeeds

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(mockFindUser).toHaveBeenNthCalledWith(1, {
        $or: [{ openidId: 'openid_123' }],
      });
      expect(mockFindUser).toHaveBeenNthCalledWith(2, { email: 'user@example.com' });
      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });

    it('should return null user when email is not found', async () => {
      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(null); // Email search fails

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(mockFindUser).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        user: null,
        error: null,
        migration: false,
      });
    });

    it('should not search by email if not provided', async () => {
      mockFindUser.mockResolvedValueOnce(null);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
      });

      expect(mockFindUser).toHaveBeenCalledTimes(1);
      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [{ openidId: 'openid_123' }],
      });
      expect(result).toEqual({
        user: null,
        error: null,
        migration: false,
      });
    });
  });

  describe('Provider conflict handling', () => {
    it('should return error when user has different provider', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'google',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(mockUser); // Email search finds user with different provider

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: null,
        error: ErrorTypes.AUTH_FAILED,
        migration: false,
      });
    });

    it('should allow login when user has openid provider', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'openid',
        openidId: 'openid_456',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(mockUser); // Email search finds user with openid provider

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });
  });

  describe('User migration scenarios', () => {
    it('should prepare user for migration when email exists without openidId', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        email: 'user@example.com',
        username: 'testuser',
        // No provider and no openidId - needs migration
      } as IUser;

      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(mockUser); // Email search finds user without openidId

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: {
          ...mockUser,
          provider: 'openid',
          openidId: 'openid_123',
        },
        error: null,
        migration: true,
      });
    });

    it('should not migrate user who already has openidId', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        provider: 'openid',
        openidId: 'existing_openid',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(mockUser); // Email search finds user with existing openidId

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });

    it('should handle user with no provider but existing openidId', async () => {
      const mockUser: IUser = {
        _id: 'user123',
        openidId: 'existing_openid',
        email: 'user@example.com',
        username: 'testuser',
        // No provider field
      } as IUser;

      mockFindUser
        .mockResolvedValueOnce(null) // Primary condition fails
        .mockResolvedValueOnce(mockUser); // Email search finds user

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });
  });

  describe('Custom strategy names', () => {
    it('should use custom strategy name in logs', async () => {
      const loggerWarn = logger.warn as jest.Mock;
      loggerWarn.mockClear();

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
        strategyName: 'customStrategy',
      });

      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('[customStrategy]'));
    });

    it('should default to openid strategy name', async () => {
      const loggerWarn = logger.warn as jest.Mock;
      loggerWarn.mockClear();

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('[openid]'));
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string openidId', async () => {
      mockFindUser.mockResolvedValueOnce(null);

      const result = await findOpenIDUser({
        openidId: '',
        findUser: mockFindUser,
      });

      expect(mockFindUser).not.toHaveBeenCalled();
      expect(result).toEqual({
        user: null,
        error: null,
        migration: false,
      });
    });

    it('should handle empty string idOnTheSource', async () => {
      mockFindUser.mockResolvedValueOnce(null);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        idOnTheSource: '',
      });

      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [{ openidId: 'openid_123' }],
      });
      expect(result).toEqual({
        user: null,
        error: null,
        migration: false,
      });
    });

    it('should handle both openidId and idOnTheSource as empty strings', async () => {
      await findOpenIDUser({
        openidId: '',
        findUser: mockFindUser,
        idOnTheSource: '',
        email: 'user@example.com',
      });

      // Should skip primary search and go directly to email search
      expect(mockFindUser).toHaveBeenCalledTimes(1);
      expect(mockFindUser).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    it('should handle findUser throwing an error', async () => {
      mockFindUser.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        findOpenIDUser({
          openidId: 'openid_123',
          findUser: mockFindUser,
        }),
      ).rejects.toThrow('Database error');
    });
  });
});
