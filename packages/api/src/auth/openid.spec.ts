import { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { ErrorTypes } from 'librechat-data-provider';
import type { IUser, UserMethods } from '@librechat/data-schemas';
import { findOpenIDUser, getOpenIdEmail } from './openid';

function newId() {
  return new Types.ObjectId();
}

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('findOpenIDUser', () => {
  let mockFindUser: jest.MockedFunction<UserMethods['findUser']>;
  const originalOpenIdIssuer = process.env.OPENID_ISSUER;

  beforeEach(() => {
    mockFindUser = jest.fn();
    delete process.env.OPENID_ISSUER;
    jest.clearAllMocks();
    (logger.warn as jest.Mock).mockClear();
    (logger.info as jest.Mock).mockClear();
  });

  afterAll(() => {
    if (originalOpenIdIssuer == null) {
      delete process.env.OPENID_ISSUER;
      return;
    }
    process.env.OPENID_ISSUER = originalOpenIdIssuer;
  });

  describe('Primary condition searches', () => {
    it('should find user by openidId', async () => {
      const mockUser: IUser = {
        _id: newId(),
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
        _id: newId(),
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
        _id: newId(),
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

    it('should bind primary lookup to issuer', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        openidIssuer: 'https://issuer.example.com',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        openidIssuer: 'https://issuer.example.com/',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [{ openidId: 'openid_123', openidIssuer: 'https://issuer.example.com' }],
      });
      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
    });

    it('should allow legacy issuer-less lookup only for the configured OpenID login issuer', async () => {
      process.env.OPENID_ISSUER = 'https://issuer.example.com/';
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        openidIssuer: 'https://issuer.example.com',
        findUser: mockFindUser,
      });

      expect(mockFindUser).toHaveBeenCalledWith({
        $or: [
          { openidId: 'openid_123', openidIssuer: 'https://issuer.example.com' },
          {
            openidId: 'openid_123',
            $or: [
              { openidIssuer: { $exists: false } },
              { openidIssuer: null },
              { openidIssuer: '' },
            ],
          },
        ],
      });
      expect(result).toEqual({
        user: { ...mockUser, openidIssuer: 'https://issuer.example.com' },
        error: null,
        migration: true,
      });
    });
  });

  describe('Email-based searches', () => {
    it('should find user by email when primary conditions fail and openidId matches', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

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
        _id: newId(),
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

    it('should reject email fallback when existing openidId does not match token sub', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_456',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

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

    it('should allow email fallback when existing openidId matches token sub', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

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

    it('should reject email fallback when stored openidIssuer does not match token issuer', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        openidIssuer: 'https://issuer-a.example.com',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        openidIssuer: 'https://issuer-b.example.com',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: null,
        error: ErrorTypes.AUTH_FAILED,
        migration: false,
      });
    });

    it('should reject legacy email fallback when token issuer is not the configured OpenID login issuer', async () => {
      process.env.OPENID_ISSUER = 'https://issuer-a.example.com';
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        openidIssuer: 'https://issuer-b.example.com',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: null,
        error: ErrorTypes.AUTH_FAILED,
        migration: false,
      });
    });
  });

  describe('User migration scenarios', () => {
    it('should prepare user for migration when email exists without openidId', async () => {
      const mockUser: IUser = {
        _id: newId(),
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

    it('should persist issuer when migrating a user by email', async () => {
      const mockUser: IUser = {
        _id: newId(),
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        openidIssuer: 'https://issuer.example.com',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(result).toEqual({
        user: {
          ...mockUser,
          provider: 'openid',
          openidId: 'openid_123',
          openidIssuer: 'https://issuer.example.com',
        },
        error: null,
        migration: true,
      });
    });

    it('should reject when user already has a different openidId', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'existing_openid',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

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

    it('should reject when user has no provider but a different openidId', async () => {
      const mockUser: IUser = {
        _id: newId(),
        openidId: 'existing_openid',
        email: 'user@example.com',
        username: 'testuser',
        // No provider field — tests a different branch than openid-provider mismatch
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

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

    it('should pass email to findUser for case-insensitive lookup (findUser handles normalization)', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'openid_123',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(null).mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: 'openid_123',
        findUser: mockFindUser,
        email: 'User@Example.COM',
      });

      expect(mockFindUser).toHaveBeenNthCalledWith(2, { email: 'User@Example.COM' });
      expect(result).toEqual({
        user: mockUser,
        error: null,
        migration: false,
      });
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

    it('should reject email fallback when openidId is empty and user has a stored openidId', async () => {
      const mockUser: IUser = {
        _id: newId(),
        provider: 'openid',
        openidId: 'existing-real-id',
        email: 'user@example.com',
        username: 'testuser',
      } as IUser;

      mockFindUser.mockResolvedValueOnce(mockUser);

      const result = await findOpenIDUser({
        openidId: '',
        findUser: mockFindUser,
        email: 'user@example.com',
      });

      expect(mockFindUser).toHaveBeenCalledTimes(1);
      expect(mockFindUser).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect(result).toEqual({
        user: null,
        error: ErrorTypes.AUTH_FAILED,
        migration: false,
      });
    });
  });
});

describe('getOpenIdEmail', () => {
  const originalEmailClaim = process.env.OPENID_EMAIL_CLAIM;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENID_EMAIL_CLAIM;
  });

  afterAll(() => {
    if (originalEmailClaim == null) {
      delete process.env.OPENID_EMAIL_CLAIM;
      return;
    }
    process.env.OPENID_EMAIL_CLAIM = originalEmailClaim;
  });

  it('uses the default claim order', () => {
    expect(
      getOpenIdEmail({
        email: 'user@example.com',
        preferred_username: 'preferred@example.com',
        upn: 'upn@example.com',
      }),
    ).toBe('user@example.com');
  });

  it('skips empty fallback claims', () => {
    expect(
      getOpenIdEmail({
        email: '',
        preferred_username: 'preferred@example.com',
        upn: 'upn@example.com',
      }),
    ).toBe('preferred@example.com');
  });

  it('uses OPENID_EMAIL_CLAIM when present', () => {
    process.env.OPENID_EMAIL_CLAIM = 'custom_identifier';

    expect(
      getOpenIdEmail({
        email: 'user@example.com',
        custom_identifier: 'agent@corp.example.com',
      }),
    ).toBe('agent@corp.example.com');
  });

  it('falls back with a warning when OPENID_EMAIL_CLAIM is missing', () => {
    process.env.OPENID_EMAIL_CLAIM = 'missing_identifier';

    expect(getOpenIdEmail({ email: 'user@example.com' }, 'remoteAgentAuth')).toBe(
      'user@example.com',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('OPENID_EMAIL_CLAIM="missing_identifier" not present in userinfo'),
    );
  });

  it('falls back with a warning when OPENID_EMAIL_CLAIM is not a string', () => {
    process.env.OPENID_EMAIL_CLAIM = 'groups';

    expect(getOpenIdEmail({ email: 'user@example.com', groups: ['a'] })).toBe('user@example.com');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'OPENID_EMAIL_CLAIM="groups" resolved to a non-string value (type: object)',
      ),
    );
  });
});
