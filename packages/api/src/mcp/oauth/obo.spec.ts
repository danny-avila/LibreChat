import type { IUser } from '@librechat/data-schemas';
import type { OboTokenResolver } from './obo';
import { resolveOboToken } from './obo';

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

  const oboConfig = { scopes: 'api://mcp-server-id/Mcp.Tools.ReadWrite' };

  const mockResolver: OboTokenResolver = jest.fn().mockResolvedValue({
    access_token: 'exchanged-mcp-token',
    expires_in: 3600,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when user has no valid OpenID token info', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue(null);

    const result = await resolveOboToken(mockUser as IUser, oboConfig, mockResolver);
    expect(result).toBeNull();
    expect(mockResolver).not.toHaveBeenCalled();
  });

  it('should return null when OpenID token is not valid (expired)', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'some-token' });
    mockIsOpenIDTokenValid.mockReturnValue(false);

    const result = await resolveOboToken(mockUser as IUser, oboConfig, mockResolver);
    expect(result).toBeNull();
    expect(mockResolver).not.toHaveBeenCalled();
  });

  it('should return null when access token is missing from token info', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ userId: 'user-123' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const result = await resolveOboToken(mockUser as IUser, oboConfig, mockResolver);
    expect(result).toBeNull();
    expect(mockResolver).not.toHaveBeenCalled();
  });

  it('should call the resolver with correct arguments and return MCPOAuthTokens', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'federated-access-token' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const beforeCall = Date.now();
    const result = await resolveOboToken(mockUser as IUser, oboConfig, mockResolver);
    const afterCall = Date.now();

    expect(mockResolver).toHaveBeenCalledWith(
      mockUser,
      'federated-access-token',
      'api://mcp-server-id/Mcp.Tools.ReadWrite',
      true,
    );

    expect(result).not.toBeNull();
    expect(result!.access_token).toBe('exchanged-mcp-token');
    expect(result!.token_type).toBe('Bearer');
    expect(result!.obtained_at).toBeGreaterThanOrEqual(beforeCall);
    expect(result!.obtained_at).toBeLessThanOrEqual(afterCall);
    expect(result!.expires_at).toBe(result!.obtained_at + 3600 * 1000);
  });

  it('should default expires_in to 3600 when not provided by resolver', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'federated-access-token' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const resolverNoExpiry: OboTokenResolver = jest.fn().mockResolvedValue({
      access_token: 'exchanged-token',
    });

    const result = await resolveOboToken(mockUser as IUser, oboConfig, resolverNoExpiry);

    expect(result).not.toBeNull();
    expect(result!.expires_at).toBe(result!.obtained_at + 3600 * 1000);
  });

  it('should return null when resolver returns no access_token', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'federated-access-token' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const emptyResolver: OboTokenResolver = jest.fn().mockResolvedValue({});
    const result = await resolveOboToken(mockUser as IUser, oboConfig, emptyResolver);
    expect(result).toBeNull();
  });

  it('should return null when resolver throws an error', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'federated-access-token' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const failingResolver: OboTokenResolver = jest
      .fn()
      .mockRejectedValue(new Error('OBO exchange failed'));

    const result = await resolveOboToken(mockUser as IUser, oboConfig, failingResolver);
    expect(result).toBeNull();
  });

  it('should use the correct scopes from oboConfig', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'federated-access-token' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const customConfig = { scopes: 'api://other-app/Custom.Scope' };
    await resolveOboToken(mockUser as IUser, customConfig, mockResolver);

    expect(mockResolver).toHaveBeenCalledWith(
      mockUser,
      'federated-access-token',
      'api://other-app/Custom.Scope',
      true,
    );
  });

  it('should respect custom expires_in from resolver', async () => {
    mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'federated-access-token' });
    mockIsOpenIDTokenValid.mockReturnValue(true);

    const shortLivedResolver: OboTokenResolver = jest.fn().mockResolvedValue({
      access_token: 'short-lived-token',
      expires_in: 300,
    });

    const result = await resolveOboToken(mockUser as IUser, oboConfig, shortLivedResolver);

    expect(result).not.toBeNull();
    expect(result!.expires_at).toBe(result!.obtained_at + 300 * 1000);
  });
});
