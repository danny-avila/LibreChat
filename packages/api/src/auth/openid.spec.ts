import { ErrorTypes } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type { IUser, UserMethods } from '@librechat/data-schemas';
import { findOpenIDUser, extractCNFromDN, normalizeRoles } from './openid';

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

    it('should pass email to findUser for case-insensitive lookup (findUser handles normalization)', async () => {
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
        email: 'User@Example.COM',
      });

      /** Email is passed as-is; findUser implementation handles normalization */
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
  });
});

describe('extractCNFromDN', () => {
  it('should extract CN from a standard LDAP DN', () => {
    expect(extractCNFromDN('CN=MY-GROUP,OU=groups,O=company,C=FR')).toBe('MY-GROUP');
  });

  it('should extract CN case-insensitively', () => {
    expect(extractCNFromDN('cn=my-group,ou=groups,o=company')).toBe('my-group');
    expect(extractCNFromDN('Cn=Mixed-Case,OU=test')).toBe('Mixed-Case');
  });

  it('should return simple role names unchanged', () => {
    expect(extractCNFromDN('simple-role')).toBe('simple-role');
    expect(extractCNFromDN('admin')).toBe('admin');
    expect(extractCNFromDN('MY-APP-USERS')).toBe('MY-APP-USERS');
  });

  it('should handle escaped commas in DN values', () => {
    expect(extractCNFromDN('CN=Group\\, Inc,OU=groups,O=company')).toBe('Group, Inc');
  });

  it('should handle other escaped characters in DN values', () => {
    expect(extractCNFromDN('CN=Test\\+Group,OU=groups')).toBe('Test+Group');
    expect(extractCNFromDN('CN=Name\\=Value,OU=groups')).toBe('Name=Value');
  });

  it('should return empty string for non-string inputs', () => {
    expect(extractCNFromDN(null)).toBe('');
    expect(extractCNFromDN(undefined)).toBe('');
    expect(extractCNFromDN(123)).toBe('');
    expect(extractCNFromDN({})).toBe('');
    expect(extractCNFromDN([])).toBe('');
  });

  it('should return empty string for empty input', () => {
    expect(extractCNFromDN('')).toBe('');
  });

  it('should return DN unchanged when no CN component at start', () => {
    expect(extractCNFromDN('OU=groups,O=company,C=FR')).toBe('OU=groups,O=company,C=FR');
  });

  it('should return original string for empty CN value', () => {
    expect(extractCNFromDN('CN=,OU=test')).toBe('CN=,OU=test');
  });

  it('should extract whitespace-only CN value', () => {
    expect(extractCNFromDN('CN= ,OU=test')).toBe(' ');
    expect(extractCNFromDN('CN=  ,OU=test')).toBe('  ');
  });
});

describe('normalizeRoles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should normalize a single string role', () => {
    expect(normalizeRoles('simple-role')).toEqual(['simple-role']);
  });

  it('should normalize a single DN string role', () => {
    expect(normalizeRoles('CN=MY-GROUP,OU=groups,O=company')).toEqual(['MY-GROUP']);
  });

  it('should normalize an array of simple roles', () => {
    expect(normalizeRoles(['admin', 'user', 'guest'])).toEqual(['admin', 'user', 'guest']);
  });

  it('should normalize an array of DN format roles', () => {
    expect(
      normalizeRoles([
        'CN=MY-APP-USERS,OU=group,O=company,C=FR',
        'CN=MY-APP-ADMINS,OU=group,O=company,C=FR',
      ]),
    ).toEqual(['MY-APP-USERS', 'MY-APP-ADMINS']);
  });

  it('should normalize an array with mixed DN and simple formats', () => {
    expect(normalizeRoles(['simple-role', 'CN=DN-Role,OU=groups', 'another-simple'])).toEqual([
      'simple-role',
      'DN-Role',
      'another-simple',
    ]);
  });

  it('should filter out empty strings from array results', () => {
    expect(normalizeRoles([null, 'valid-role', undefined, 'CN=Group,OU=test'])).toEqual([
      'valid-role',
      'Group',
    ]);
  });

  it('should return empty array and log warning for unexpected types', () => {
    expect(normalizeRoles(null)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected roles format'));

    jest.clearAllMocks();
    expect(normalizeRoles(undefined)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected roles format'));

    jest.clearAllMocks();
    expect(normalizeRoles(123)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected roles format'));

    jest.clearAllMocks();
    expect(normalizeRoles({ role: 'admin' })).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected roles format'));
  });

  it('should return empty array for empty array input without warning', () => {
    jest.clearAllMocks();
    expect(normalizeRoles([])).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
