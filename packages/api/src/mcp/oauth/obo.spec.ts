import type { IUser } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { OboTokenResolver } from './obo';
import { isOboConfigStillTrusted, resolveOboToken } from './obo';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('~/utils/oidc', () => ({
  extractOpenIDTokenInfo: jest.fn(),
  isOpenIDTokenValid: jest.fn(),
}));

import { extractOpenIDTokenInfo, isOpenIDTokenValid } from '~/utils/oidc';

const mockExtractOpenIDTokenInfo = extractOpenIDTokenInfo as jest.Mock;
const mockIsOpenIDTokenValid = isOpenIDTokenValid as jest.Mock;

describe('resolveOboToken', () => {
  const mockUser: Partial<IUser> = {
    id: 'user-123',
    provider: 'openid',
    openidId: 'oidc-sub-456',
    email: 'test@example.com',
    name: 'Test User',
    federatedTokens: {
      access_token: 'federated-access-token',
      id_token: 'federated-id-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  };

  const oboConfig = {
    scopes: 'api://mcp-server-id/Mcp.Tools.ReadWrite',
  };

  let mockResolver: jest.MockedFunction<OboTokenResolver>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolver = jest.fn();
  });

  it('should reuse a cached OBO token without requiring a valid upstream token', async () => {
    mockResolver.mockResolvedValueOnce({
      access_token: 'cached-mcp-token',
      expires_in: 1800,
    });

    const result = await resolveOboToken(mockUser as IUser, oboConfig, mockResolver);

    expect(mockResolver).toHaveBeenCalledTimes(1);
    expect(mockResolver).toHaveBeenCalledWith(mockUser, undefined, oboConfig.scopes, true, true);

    expect(mockExtractOpenIDTokenInfo).not.toHaveBeenCalled();
    expect(mockIsOpenIDTokenValid).not.toHaveBeenCalled();

    expect(result.access_token).toBe('cached-mcp-token');
    expect(result.token_type).toBe('Bearer');
    expect(result.expires_at).toBe(result.obtained_at + 1800 * 1000);
  });

  it('should throw when user has no valid OpenID token info', async () => {
    mockResolver.mockResolvedValueOnce(null);
    mockExtractOpenIDTokenInfo.mockReturnValue(null);

    await expect(resolveOboToken(mockUser as IUser, oboConfig, mockResolver)).rejects.toMatchObject(
      {
        reason: 'missing_upstream_token',
        retryable: false,
      },
    );

    expect(mockResolver).toHaveBeenCalledTimes(1);
    expect(mockResolver).toHaveBeenCalledWith(mockUser, undefined, oboConfig.scopes, true, true);
  });

  it('should throw when OpenID token is not valid (expired)', async () => {
    mockResolver.mockResolvedValueOnce(null);
    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'some-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(false);

    await expect(resolveOboToken(mockUser as IUser, oboConfig, mockResolver)).rejects.toMatchObject(
      {
        reason: 'missing_upstream_token',
        retryable: false,
      },
    );

    expect(mockResolver).toHaveBeenCalledTimes(1);
  });

  it('should throw when access token is missing from token info', async () => {
    mockResolver.mockResolvedValueOnce(null);
    mockExtractOpenIDTokenInfo.mockReturnValue({
      userId: 'user-123',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    await expect(resolveOboToken(mockUser as IUser, oboConfig, mockResolver)).rejects.toMatchObject(
      {
        reason: 'missing_upstream_access_token',
        retryable: false,
      },
    );

    expect(mockResolver).toHaveBeenCalledTimes(1);
  });

  it('should call the resolver with correct arguments and return MCPOAuthTokens', async () => {
    mockResolver.mockResolvedValueOnce(null).mockResolvedValueOnce({
      access_token: 'exchanged-mcp-token',
      expires_in: 3600,
    });

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const beforeCall = Date.now();

    const result = await resolveOboToken(mockUser as IUser, oboConfig, mockResolver);

    const afterCall = Date.now();

    expect(mockResolver).toHaveBeenCalledTimes(2);

    expect(mockResolver).toHaveBeenNthCalledWith(
      1,
      mockUser,
      undefined,
      oboConfig.scopes,
      true,
      true,
    );

    expect(mockResolver).toHaveBeenNthCalledWith(
      2,
      mockUser,
      'federated-access-token',
      oboConfig.scopes,
      true,
    );

    expect(result.access_token).toBe('exchanged-mcp-token');
    expect(result.token_type).toBe('Bearer');
    expect(result.obtained_at).toBeGreaterThanOrEqual(beforeCall);
    expect(result.obtained_at).toBeLessThanOrEqual(afterCall);
    expect(result.expires_at).toBe(result.obtained_at + 3600 * 1000);
  });

  it('should default expires_in to 3600 when not provided by resolver', async () => {
    const resolverNoExpiry: OboTokenResolver = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        access_token: 'exchanged-token',
      });

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const result = await resolveOboToken(mockUser as IUser, oboConfig, resolverNoExpiry);

    expect(result.expires_at).toBe(result.obtained_at + 3600 * 1000);
  });

  it('should throw when resolver returns no access_token', async () => {
    const emptyResolver: OboTokenResolver = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({} as { access_token: string });

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    await expect(
      resolveOboToken(mockUser as IUser, oboConfig, emptyResolver),
    ).rejects.toMatchObject({
      reason: 'empty_exchange_response',
      retryable: false,
    });
  });

  it('should throw a retryable error when resolver reports a transient failure', async () => {
    const failingResolver: OboTokenResolver = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(
        Object.assign(new Error('temporary timeout'), {
          retryable: true,
        }),
      );

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    await expect(
      resolveOboToken(mockUser as IUser, oboConfig, failingResolver),
    ).rejects.toMatchObject({
      reason: 'exchange_failed',
      retryable: true,
      userMessage: 'Temporary OBO token exchange failure.',
    });
  });

  it('should throw a non-retryable error when resolver reports a permanent failure', async () => {
    const failingResolver: OboTokenResolver = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('invalid_grant: assertion invalid'));

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    await expect(
      resolveOboToken(mockUser as IUser, oboConfig, failingResolver),
    ).rejects.toMatchObject({
      reason: 'exchange_failed',
      retryable: false,
      userMessage: 'The identity provider rejected the OBO token exchange.',
    });
  });

  it('should use the correct scopes from oboConfig', async () => {
    mockResolver.mockResolvedValueOnce(null).mockResolvedValueOnce({
      access_token: 'exchanged-mcp-token',
      expires_in: 3600,
    });

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const customConfig = {
      scopes: 'api://other-app/Custom.Scope',
    };

    await resolveOboToken(mockUser as IUser, customConfig, mockResolver);

    expect(mockResolver).toHaveBeenNthCalledWith(
      1,
      mockUser,
      undefined,
      'api://other-app/Custom.Scope',
      true,
      true,
    );

    expect(mockResolver).toHaveBeenNthCalledWith(
      2,
      mockUser,
      'federated-access-token',
      'api://other-app/Custom.Scope',
      true,
    );
  });

  it('should respect custom expires_in from resolver', async () => {
    const shortLivedResolver: OboTokenResolver = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        access_token: 'short-lived-token',
        expires_in: 300,
      });

    mockExtractOpenIDTokenInfo.mockReturnValue({
      accessToken: 'federated-access-token',
    });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const result = await resolveOboToken(mockUser as IUser, oboConfig, shortLivedResolver);

    expect(result.expires_at).toBe(result.obtained_at + 300 * 1000);
  });
});

describe('isOboConfigStillTrusted', () => {
  const adminPerms = {
    [PermissionTypes.MCP_SERVERS]: {
      [Permissions.CONFIGURE_OBO]: true,
    },
  };

  const userPerms = {
    [PermissionTypes.MCP_SERVERS]: {
      [Permissions.CONFIGURE_OBO]: false,
    },
  };

  const noOboPerms = {
    [PermissionTypes.MCP_SERVERS]: {},
  };

  it('returns false when authorId is missing', async () => {
    const result = await isOboConfigStillTrusted({
      authorId: undefined,
      getUserRoleByAuthorId: jest.fn(),
      getRolePermissions: jest.fn(),
    });

    expect(result).toBe(false);
  });

  it('returns false when the author has no role (deleted user)', async () => {
    const result = await isOboConfigStillTrusted({
      authorId: 'gone',
      getUserRoleByAuthorId: jest.fn().mockResolvedValue(null),
      getRolePermissions: jest.fn(),
    });

    expect(result).toBe(false);
  });

  it('returns false when role lookup throws', async () => {
    const result = await isOboConfigStillTrusted({
      authorId: 'u1',
      getUserRoleByAuthorId: jest.fn().mockResolvedValue('ADMIN'),
      getRolePermissions: jest.fn().mockRejectedValue(new Error('db down')),
    });

    expect(result).toBe(false);
  });

  it('returns false when the role lacks CONFIGURE_OBO sub-key (older deployment)', async () => {
    const result = await isOboConfigStillTrusted({
      authorId: 'u1',
      getUserRoleByAuthorId: jest.fn().mockResolvedValue('ADMIN'),
      getRolePermissions: jest.fn().mockResolvedValue(noOboPerms),
    });

    expect(result).toBe(false);
  });

  it('returns false when CONFIGURE_OBO is explicitly false', async () => {
    const result = await isOboConfigStillTrusted({
      authorId: 'u1',
      getUserRoleByAuthorId: jest.fn().mockResolvedValue('USER'),
      getRolePermissions: jest.fn().mockResolvedValue(userPerms),
    });

    expect(result).toBe(false);
  });

  it('returns true when the author still has CONFIGURE_OBO', async () => {
    const result = await isOboConfigStillTrusted({
      authorId: 'u1',
      getUserRoleByAuthorId: jest.fn().mockResolvedValue('ADMIN'),
      getRolePermissions: jest.fn().mockResolvedValue(adminPerms),
    });

    expect(result).toBe(true);
  });
});
